import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { conversations, messages, citations, usageEvents } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { chatClient, CHAT_MODEL, estimateCostUsd } from "@/lib/ai/embed";
import { embedQuery } from "@/lib/ai/embed";
import { vectorSearch, bm25Search } from "@/lib/search/retrieval";
import { kgSearch, kgKeywordSearch } from "@/lib/search/kg";
import { rrf, computeConfidence } from "@/lib/search/rrf";
import { chatRatelimit, loadHistory, appendMessage } from "@/lib/redis";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  kbId: z.string().uuid(),
  message: z.string().min(1).max(2000),
  topK: z.number().int().min(1).max(20).default(5),
});

const SYSTEM_PROMPT = `You are a document Q&A assistant. Your job is to answer questions using ONLY the context chunks provided below.

STRICT RULES — follow every one:
1. Write your answer as clear, natural prose. Do NOT output bullet lists of citation numbers.
2. Cite sources INLINE by placing [N] immediately after the sentence or clause that uses that chunk — e.g. "The deadline is March 15 [2]."
3. Every sentence that contains a factual claim MUST have at least one inline [N] citation.
4. NEVER place citations on their own line or as a standalone list at the end.
5. NEVER write "Sources:", "References:", or any citation header.
6. If the context does not contain enough information, respond with exactly: "I don't have enough information in the provided documents to answer this question."
7. Be thorough and complete — write full sentences, not fragments.`;

/**
 * HyDE (Hypothetical Document Embeddings) query rewriting.
 *
 * Why: Questions and answers exist in different embedding spaces.
 * "What is the termination notice period?" embeds very differently from
 * "The termination notice period is 30 days." Generating a hypothetical
 * answer and embedding that instead bridges the vocabulary gap between
 * query and document text — the single highest-ROI retrieval improvement.
 *
 * The hypothetical answer is only used for vector embedding.
 * The original query is still used for BM25 (keyword search needs real terms).
 *
 * Falls back to original query if the HyDE call fails — non-critical path.
 */
async function generateHyDE(message: string): Promise<{ text: string; used: boolean }> {
  try {
    const res = await chatClient.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Write a 2-3 sentence factual answer to the following question as if you had the relevant documents in front of you. Be specific and use domain-appropriate language. If the question is ambiguous, write what a correct answer would look like.",
        },
        { role: "user", content: message },
      ],
      max_tokens: 150,
      temperature: 0.1,
    });
    const hydeText = res.choices[0]?.message?.content?.trim();
    if (hydeText) return { text: hydeText, used: true };
  } catch {
    // Non-critical — fall back to original query silently
  }
  return { text: message, used: false };
}

/**
 * POST /api/chat
 *
 * SSE streaming chat endpoint — HERALD-enhanced.
 *
 * Flow:
 *   1. Auth + rate limit
 *   2. HyDE query rewriting (embed hypothetical answer, not raw question)
 *   3. Three-way parallel retrieval: KG + vector + BM25
 *   4. Unified RRF merge (KG nodes get +0.15 boost)
 *   5. Compute confidence
 *   6. If confidence=none, refuse without calling LLM
 *   7. Build prompt with context + conversation history
 *   8. Stream response via SSE
 *   9. Persist message + citations + usage + retrieval counts (setImmediate)
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  // Rate limit: 20 chat messages per minute per user
  const { success, reset } = await chatRatelimit.limit(session.user.id);
  if (!success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait before sending more messages.", code: "RATE_LIMIT" },
      { status: 429, headers: { "X-RateLimit-Reset": String(reset) } }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const { message, kbId, topK } = parsed.data;
  let { conversationId } = parsed.data;
  const { tenantId, id: userId } = session.user;
  const startTime = Date.now();

  // Verify KB belongs to tenant
  const kb = await db.query.knowledgeBases.findFirst({
    where: (kb, { eq, and }) => and(eq(kb.id, kbId), eq(kb.tenantId, tenantId)),
    columns: { id: true },
  });
  if (!kb) {
    return NextResponse.json({ error: "Knowledge base not found", code: "NOT_FOUND" }, { status: 404 });
  }

  // Create or verify conversation
  if (!conversationId) {
    const [conv] = await db
      .insert(conversations)
      .values({ tenantId, userId, kbId })
      .returning({ id: conversations.id });
    conversationId = conv.id;
  } else {
    const conv = await db.query.conversations.findFirst({
      where: (c, { eq, and }) =>
        and(eq(c.id, conversationId!), eq(c.tenantId, tenantId), eq(c.userId, userId)),
      columns: { id: true },
    });
    if (!conv) {
      return NextResponse.json({ error: "Conversation not found", code: "NOT_FOUND" }, { status: 404 });
    }
  }

  // Save user message before retrieval so it's persisted even if retrieval fails
  await db.insert(messages).values({ conversationId, role: "user", content: message });

  // ── HERALD Retrieval ───────────────────────────────────────────────────────

  // Step 1: HyDE — embed hypothetical answer for better vector recall
  // BM25 and KG keyword search still use the original query
  const { text: hydeText, used: hydeUsed } = await generateHyDE(message);
  const queryEmbedding = await embedQuery(hydeText);

  // Step 2: Three-way parallel retrieval
  // KG search: structured knowledge nodes (Hot Layer)
  // Vector search: cosine similarity on chunk embeddings (Cold Layer)
  // BM25 search: keyword matching on stored tsvector (Cold Layer)
  const [kgVectorResults, kgKeywordResults, vectorResults, bm25Results] =
    await Promise.allSettled([
      kgSearch(tenantId, kbId, queryEmbedding, topK * 2),
      kgKeywordSearch(tenantId, kbId, message, topK),
      vectorSearch(tenantId, kbId, queryEmbedding, topK * 4),
      bm25Search(tenantId, kbId, message, topK * 4),
    ]);

  // Step 3: Unified RRF merge with KG source boost
  const mergedChunks = rrf(
    [
      kgVectorResults.status  === "fulfilled" ? kgVectorResults.value  : [],
      kgKeywordResults.status === "fulfilled" ? kgKeywordResults.value : [],
      vectorResults.status    === "fulfilled" ? vectorResults.value    : [],
      bm25Results.status      === "fulfilled" ? bm25Results.value      : [],
    ],
    topK,
    60,
    { kg: 0.15, vector: 0, bm25: 0 }
  );

  const kgNodesUsed = mergedChunks.filter((c) => c.source === "kg").length;

  const { label: confidenceLabel, score: confidenceScore } = computeConfidence(mergedChunks);

  // ── Refuse if no meaningful context ───────────────────────────────────────
  if (confidenceLabel === "none") {
    const refusalText =
      "I don't have enough information in the provided documents to answer this question.";

    await db.insert(messages).values({
      conversationId,
      role: "assistant",
      content: refusalText,
      confidence: "none",
      confidenceScore: 0,
      latencyMs: Date.now() - startTime,
      promptTokens: 0,
      completionTokens: 0,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "meta",
              conversationId,
              confidence: "none",
              score: 0,
              citations: [],
              kgNodesUsed: 0,
              hydeUsed,
            })}\n\n`
          )
        );
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", content: refusalText })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // ── Build context ──────────────────────────────────────────────────────────
  const contextBlock = mergedChunks
    .map((c, i) => `[${i + 1}] ${c.docName}${c.pageNumber ? ` (p.${c.pageNumber})` : ""}:\n${c.content}`)
    .join("\n\n---\n\n");

  // Load conversation history from Redis
  const history = await loadHistory(tenantId, conversationId);

  const prompt = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    {
      role: "user" as const,
      content: `Context:\n${contextBlock}\n\nQuestion: ${message}`,
    },
  ];

  // ── Stream response ────────────────────────────────────────────────────────
  const citationData = mergedChunks.map((c, i) => ({
    rank: i + 1,
    chunkId: c.id,
    documentId: c.documentId,
    docName: c.docName,
    pageNumber: c.pageNumber,
    excerpt: c.content.slice(0, 200),
    score: c.score,
    source: c.source,
  }));

  const encoder = new TextEncoder();
  let fullContent = "";
  let promptTokens = 0;
  let completionTokens = 0;

  // Collect chunk ids to increment retrieval counts (KG nodes excluded —
  // they have their own retrieval_count column updated separately)
  const rawChunkIds = mergedChunks
    .filter((c) => c.source !== "kg" && c.chunkIndex >= 0)
    .map((c) => c.id);

  const kgNodeIds = mergedChunks
    .filter((c) => c.source === "kg")
    .map((c) => c.id);

  const stream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 15000);

      try {
        // Send metadata first — conversationId, confidence, citations, HERALD signals
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "meta",
              conversationId,
              confidence: confidenceLabel,
              score: confidenceScore,
              citations: citationData,
              kgNodesUsed,
              hydeUsed,
            })}\n\n`
          )
        );

        const completion = await chatClient.chat.completions.create({
          model: CHAT_MODEL,
          messages: prompt,
          stream: true,
          temperature: 0.1,
          max_tokens: 8192,
        });

        // Buffer reasoning silently — only emit if no content tokens ever arrive.
        let hasContentTokens = false;
        let reasoningBuffer = "";

        for await (const chunk of completion) {
          const raw = chunk.choices[0]?.delta as Record<string, unknown> | undefined;
          const content = (raw?.content as string) ?? "";
          const reasoning = (raw?.reasoning as string) ?? "";

          if (content) {
            hasContentTokens = true;
            fullContent += content;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "text", content })}\n\n`)
            );
          } else if (reasoning) {
            reasoningBuffer += reasoning;
          }

          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens;
            completionTokens = chunk.usage.completion_tokens;
          }
        }

        // Reasoning-only model fallback
        if (!hasContentTokens && reasoningBuffer) {
          fullContent = reasoningBuffer;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "text", content: reasoningBuffer })}\n\n`)
          );
        }

        if (!fullContent.trim()) {
          console.warn("[chat] WARNING: fullContent is empty after stream");
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        console.error("[chat] stream error:", err instanceof Error ? err.message : err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: "An error occurred while generating the response. Please try again." })}\n\n`
          )
        );
      } finally {
        clearInterval(heartbeat);
        controller.close();

        // ── Persist asynchronously — don't block the response ────────────────
        setImmediate(async () => {
          const latencyMs = Date.now() - startTime;
          const costUsd = estimateCostUsd(CHAT_MODEL, promptTokens, completionTokens);

          const [assistantMsg] = await db
            .insert(messages)
            .values({
              conversationId: conversationId!,
              role: "assistant",
              content: fullContent,
              confidence: confidenceLabel,
              confidenceScore,
              latencyMs,
              promptTokens,
              completionTokens,
            })
            .returning({ id: messages.id });

          // Insert citations — KG node citations (source === "kg") carry a
          // kg_nodes.id as chunkId which has no row in chunks, so they must be
          // excluded to avoid FK violations on citations_chunk_id_chunks_id_fk.
          const chunkCitations = citationData.filter(
            (c) => c.source !== "kg" && c.chunkId && c.documentId
          );
          if (chunkCitations.length > 0) {
            await db.insert(citations).values(
              chunkCitations.map((c) => ({
                messageId: assistantMsg.id,
                chunkId: c.chunkId,
                documentId: c.documentId,
                docName: c.docName,
                pageNumber: c.pageNumber,
                excerpt: c.excerpt,
                score: c.score,
                rank: c.rank,
              }))
            );
          }

          // Track usage event
          await db.insert(usageEvents).values({
            tenantId,
            userId,
            eventType: "chat",
            model: CHAT_MODEL,
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            costUsd: String(costUsd),
            kbId,
          });

          // ── HERALD: increment retrieval counts ──────────────────────────────
          // Raw chunks: increment chunks.retrieval_count
          if (rawChunkIds.length > 0) {
            await db.execute(sql`
              UPDATE chunks
              SET retrieval_count    = retrieval_count + 1,
                  last_retrieved_at  = NOW()
              WHERE id = ANY(ARRAY[${sql.join(rawChunkIds.map(id => sql`${id}::uuid`), sql`, `)}])
            `);
          }

          // KG nodes: increment kg_nodes.retrieval_count
          if (kgNodeIds.length > 0) {
            await db.execute(sql`
              UPDATE kg_nodes
              SET retrieval_count = retrieval_count + 1
              WHERE id = ANY(ARRAY[${sql.join(kgNodeIds.map(id => sql`${id}::uuid`), sql`, `)}])
            `);
          }

          // Update Redis conversation history
          await appendMessage(tenantId, conversationId!, { role: "user", content: message });
          await appendMessage(tenantId, conversationId!, { role: "assistant", content: fullContent });

          // Update conversation last_active + auto-title on first exchange
          const conv = await db.query.conversations.findFirst({
            where: eq(conversations.id, conversationId!),
            columns: { title: true },
          });

          const updates: Record<string, unknown> = { lastActive: new Date() };

          if (!conv?.title) {
            try {
              const titleRes = await chatClient.chat.completions.create({
                model: CHAT_MODEL,
                messages: [
                  {
                    role: "system",
                    content:
                      "Summarize the following question in 4–6 words as a conversation title. No punctuation. No quotes. Return only the title.",
                  },
                  { role: "user", content: message },
                ],
                temperature: 0.3,
                max_tokens: 20,
              });
              const title = titleRes.choices[0]?.message?.content?.trim();
              if (title) updates.title = title;
            } catch {
              // Non-critical — title stays null
            }
          }

          await db
            .update(conversations)
            .set(updates)
            .where(eq(conversations.id, conversationId!));
        });
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
