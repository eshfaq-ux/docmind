import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { conversations, messages, citations, usageEvents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { openai, chatClient, CHAT_MODEL, estimateCostUsd } from "@/lib/ai/embed";
import { embedQuery } from "@/lib/ai/embed";
import { vectorSearch, bm25Search } from "@/lib/search/retrieval";
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
 * POST /api/chat
 *
 * SSE streaming chat endpoint.
 * All 4 SSE headers are required — missing any breaks streaming in nginx/Vercel.
 *
 * Flow:
 *   1. Auth + rate limit
 *   2. Embed query
 *   3. Hybrid retrieval (vector + BM25) → RRF → top 5
 *   4. Compute confidence
 *   5. If confidence=none, refuse without calling LLM
 *   6. Build prompt with context + conversation history
 *   7. Stream gpt-4o-mini via SSE
 *   8. Persist message + citations + usage event (setImmediate)
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

  // Create conversation if not provided
  if (!conversationId) {
    const [conv] = await db
      .insert(conversations)
      .values({ tenantId, userId, kbId })
      .returning({ id: conversations.id });
    conversationId = conv.id;
  } else {
    // Verify conversation belongs to this user + tenant
    const conv = await db.query.conversations.findFirst({
      where: (c, { eq, and }) =>
        and(eq(c.id, conversationId!), eq(c.tenantId, tenantId), eq(c.userId, userId)),
      columns: { id: true },
    });
    if (!conv) {
      return NextResponse.json({ error: "Conversation not found", code: "NOT_FOUND" }, { status: 404 });
    }
  }

  // Save user message
  const [userMsg] = await db
    .insert(messages)
    .values({ conversationId, role: "user", content: message })
    .returning({ id: messages.id });

  // ── Retrieval ──────────────────────────────────────────────────────────────
  const queryEmbedding = await embedQuery(message);

  const [vectorResults, bm25Results] = await Promise.allSettled([
    vectorSearch(tenantId, kbId, queryEmbedding, topK * 4),
    bm25Search(tenantId, kbId, message, topK * 4),
  ]);

  const resultSets = [
    vectorResults.status === "fulfilled" ? vectorResults.value : [],
    bm25Results.status === "fulfilled" ? bm25Results.value : [],
  ];

  const mergedChunks = rrf(resultSets, topK);
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

    // SSE-encoded refusal
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "meta", conversationId, confidence: "none", score: 0, citations: [] })}\n\n`
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
  }));

  const encoder = new TextEncoder();
  let fullContent = "";
  let promptTokens = 0;
  let completionTokens = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 15000);

      try {
        // Send metadata first (conversationId, confidence, citations)
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "meta",
              conversationId,
              confidence: confidenceLabel,
              score: confidenceScore,
              citations: citationData,
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
        // Some models (e.g. DeepSeek-R1) emit a reasoning field first, then content.
        // Streaming reasoning as content produces the "thinking monologue" artifact.
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
            // Always buffer reasoning — never stream it directly
            reasoningBuffer += reasoning;
          }

          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens;
            completionTokens = chunk.usage.completion_tokens;
          }
        }

        // Reasoning-only model fallback: no content tokens arrived, use reasoning as answer
        if (!hasContentTokens && reasoningBuffer) {
          fullContent = reasoningBuffer;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "text", content: reasoningBuffer })}\n\n`)
          );
        }

        if (!fullContent.trim()) {
          console.warn("[chat] WARNING: fullContent is empty after stream");
        } else {
          console.log("[chat] fullContent ok, length:", fullContent.length, "preview:", JSON.stringify(fullContent.slice(0, 120)));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Generation failed";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: errMsg })}\n\n`)
        );
      } finally {
        clearInterval(heartbeat);
        controller.close();

        // Persist asynchronously — don't block the response
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

          // Insert citations
          if (citationData.length > 0) {
            await db.insert(citations).values(
              citationData.map((c) => ({
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

          // Track usage
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
            // Generate a short title from the first user message (≤6 words)
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
      "X-Accel-Buffering": "no", // Required — prevents nginx/Vercel from buffering
    },
  });
}
