import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { evalDatasets, evalCases, evalRuns, evalResults, usageEvents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { openai, CHAT_MODEL, estimateCostUsd, embedQuery } from "@/lib/ai/embed";
import { vectorSearch, bm25Search } from "@/lib/search/retrieval";
import { rrf } from "@/lib/search/rrf";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(
  _req: Request,
  { params }: { params: { datasetId: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataset = await db.query.evalDatasets.findFirst({
    where: and(
      eq(evalDatasets.id, params.datasetId),
      eq(evalDatasets.tenantId, session.user.tenantId)
    ),
    with: {
      cases: { orderBy: (c, { asc }) => [asc(c.createdAt)] },
      runs: {
        orderBy: (r, { desc }) => [desc(r.createdAt)],
        limit: 10,
        with: { results: true },
      },
    },
  });

  if (!dataset) return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  return NextResponse.json(dataset);
}

export async function POST(
  req: Request,
  { params }: { params: { datasetId: string } }
) {
  const url = new URL(req.url);
  if (!url.pathname.endsWith("/run")) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const label: string = body.label ?? `Run ${new Date().toISOString().slice(0, 16)}`;

  const dataset = await db.query.evalDatasets.findFirst({
    where: and(
      eq(evalDatasets.id, params.datasetId),
      eq(evalDatasets.tenantId, session.user.tenantId)
    ),
    with: { cases: true },
    columns: { id: true, kbId: true, tenantId: true },
  });

  if (!dataset) return NextResponse.json({ error: "Dataset not found" }, { status: 404 });

  const { kbId, tenantId } = dataset;

  const [run] = await db
    .insert(evalRuns)
    .values({ datasetId: dataset.id, tenantId, label, totalCount: dataset.cases.length })
    .returning();

  const JUDGE_PROMPT = `You are an evaluation judge. Score on a scale of 0.0 to 1.0.
Return ONLY valid JSON: {"faithfulness": 0.0, "answer_relevance": 0.0, "retrieval_relevance": 0.0}

- faithfulness: Does the answer contain ONLY facts supported by the context? (1=fully grounded, 0=hallucinated)
- answer_relevance: Does the answer directly address the question? (1=fully relevant, 0=off-topic)
- retrieval_relevance: Does the retrieved context contain information needed to answer? (1=highly relevant, 0=irrelevant)`;

  const CITATION_JUDGE_PROMPT = `Given a sentence from an answer and a source chunk, determine if the sentence's claim is supported by the chunk.
Return ONLY valid JSON: {"supported": true} or {"supported": false}
Be strict: if the chunk does not contain the information in the sentence, return false.`;

  const rows: (typeof evalResults.$inferInsert)[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for (const evalCase of dataset.cases) {
    try {
      const embedding = await embedQuery(evalCase.question);
      const [vectorRes, bm25Res] = await Promise.allSettled([
        vectorSearch(tenantId, kbId, embedding, 20),
        bm25Search(tenantId, kbId, evalCase.question, 20),
      ]);

      const retrievedChunks = rrf(
        [
          vectorRes.status === "fulfilled" ? vectorRes.value : [],
          bm25Res.status === "fulfilled" ? bm25Res.value : [],
        ],
        5
      );

      const contextBlock = retrievedChunks
        .map((c, i) => `[${i + 1}] ${c.docName}:\n${c.content}`)
        .join("\n\n---\n\n");

      // Generate answer
      const answerRes = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: "Answer using ONLY the provided context. Cite sources with [N]. If insufficient context, say so." },
          { role: "user", content: `Context:\n${contextBlock}\n\nQuestion: ${evalCase.question}` },
        ],
        temperature: 0.1,
        max_tokens: 512,
      });
      const generatedAnswer = answerRes.choices[0]?.message?.content ?? "";
      totalPromptTokens += answerRes.usage?.prompt_tokens ?? 0;
      totalCompletionTokens += answerRes.usage?.completion_tokens ?? 0;

      // LLM-as-judge: faithfulness + answer_relevance + retrieval_relevance
      const judgeRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: JUDGE_PROMPT },
          {
            role: "user",
            content: `Question: ${evalCase.question}\n\nContext:\n${contextBlock}\n\nGenerated Answer: ${generatedAnswer}\n\nExpected Answer: ${evalCase.expectedAnswer ?? "N/A"}`,
          },
        ],
        temperature: 0,
        max_tokens: 128,
        response_format: { type: "json_object" },
      });
      totalPromptTokens += judgeRes.usage?.prompt_tokens ?? 0;
      totalCompletionTokens += judgeRes.usage?.completion_tokens ?? 0;

      let scores = { faithfulness: 0.5, answer_relevance: 0.5, retrieval_relevance: 0.5 };
      try {
        scores = { ...scores, ...JSON.parse(judgeRes.choices[0]?.message?.content ?? "{}") };
      } catch { /* keep defaults */ }

      // Citation accuracy — score each [N] reference in the answer
      const citationAccuracy = await _scoreCitationAccuracy(
        generatedAnswer,
        retrievedChunks,
        CITATION_JUDGE_PROMPT,
        (pt, ct) => { totalPromptTokens += pt; totalCompletionTokens += ct; }
      );

      const passed =
        scores.faithfulness >= 0.7 &&
        scores.answer_relevance >= 0.7 &&
        scores.retrieval_relevance >= 0.5 &&
        (citationAccuracy === null || citationAccuracy >= 0.7);

      rows.push({
        runId: run.id,
        caseId: evalCase.id,
        generatedAnswer,
        retrievedChunkIds: retrievedChunks.map((c) => c.id),
        retrievalRelevance: scores.retrieval_relevance,
        contextRelevance: scores.retrieval_relevance,
        faithfulness: scores.faithfulness,
        answerRelevance: scores.answer_relevance,
        citationAccuracy,
        passed,
      });
    } catch {
      rows.push({
        runId: run.id,
        caseId: evalCase.id,
        generatedAnswer: "[Error during evaluation]",
        retrievedChunkIds: [],
        retrievalRelevance: 0,
        contextRelevance: 0,
        faithfulness: 0,
        answerRelevance: 0,
        citationAccuracy: null,
        passed: false,
      });
    }
  }

  if (rows.length > 0) await db.insert(evalResults).values(rows);

  const passedCount = rows.filter((r) => r.passed).length;
  const avg = (key: keyof (typeof rows)[0]) =>
    rows.length > 0 ? rows.reduce((s, r) => s + ((r[key] as number) ?? 0), 0) / rows.length : null;

  const citRows = rows.filter((r) => r.citationAccuracy !== null);
  const avgCitationAccuracy =
    citRows.length > 0
      ? citRows.reduce((s, r) => s + (r.citationAccuracy as number), 0) / citRows.length
      : null;

  await db.update(evalRuns).set({
    passedCount,
    totalCount: rows.length,
    avgFaithfulness: avg("faithfulness"),
    avgAnswerRelevance: avg("answerRelevance"),
    avgRetrievalRelevance: avg("retrievalRelevance"),
    avgContextRelevance: avg("contextRelevance"),
    avgCitationAccuracy,
  }).where(eq(evalRuns.id, run.id));

  const costUsd = estimateCostUsd(CHAT_MODEL, totalPromptTokens, totalCompletionTokens);
  await db.insert(usageEvents).values({
    tenantId, userId: session.user.id, eventType: "eval", model: CHAT_MODEL,
    promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens,
    totalTokens: totalPromptTokens + totalCompletionTokens, costUsd: String(costUsd),
  });

  return NextResponse.json({ runId: run.id, passedCount, totalCount: rows.length,
    avgFaithfulness: avg("faithfulness"), avgAnswerRelevance: avg("answerRelevance"),
    avgRetrievalRelevance: avg("retrievalRelevance"), avgCitationAccuracy });
}

// ── Citation accuracy ─────────────────────────────────────────────────────────

interface Chunk { id: string; content: string }

/**
 * For each [N] marker in the answer, verify the surrounding sentence is
 * actually supported by chunk N's content via a lightweight LLM call.
 * Returns score in [0,1] or null if no citations present.
 */
async function _scoreCitationAccuracy(
  answer: string,
  chunks: Chunk[],
  judgePrompt: string,
  trackTokens: (pt: number, ct: number) => void
): Promise<number | null> {
  const pattern = /\[(\d+)\]/g;
  const refs: { markerIndex: number; markerLen: number; chunkIdx: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(answer)) !== null) {
    const n = parseInt(m[1], 10) - 1;
    if (n >= 0 && n < chunks.length) {
      refs.push({ markerIndex: m.index, markerLen: m[0].length, chunkIdx: n });
    }
  }
  if (refs.length === 0) return null;

  // Deduplicate by (chunkIdx + sentence) to avoid redundant LLM calls
  const seen = new Set<string>();
  const toEval: { sentence: string; chunkContent: string }[] = [];
  for (const ref of refs) {
    const sentence = _surroundingSentence(answer, ref.markerIndex, ref.markerLen);
    const key = `${ref.chunkIdx}::${sentence.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    toEval.push({ sentence, chunkContent: chunks[ref.chunkIdx].content });
  }

  let supported = 0;
  for (const { sentence, chunkContent } of toEval) {
    try {
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: judgePrompt },
          { role: "user", content: `Sentence: "${sentence}"\n\nSource chunk: "${chunkContent.slice(0, 600)}"` },
        ],
        temperature: 0,
        max_tokens: 32,
        response_format: { type: "json_object" },
      });
      trackTokens(res.usage?.prompt_tokens ?? 0, res.usage?.completion_tokens ?? 0);
      const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { supported?: boolean };
      if (parsed.supported === true) supported++;
    } catch { /* conservative: treat as unsupported */ }
  }

  return toEval.length > 0 ? supported / toEval.length : null;
}

function _surroundingSentence(text: string, idx: number, len: number): string {
  let start = idx;
  while (start > 0 && !/[.!?]/.test(text[start - 1])) start--;
  let end = idx + len;
  while (end < text.length && !/[.!?]/.test(text[end])) end++;
  return text.slice(start, end + 1).trim();
}
