import type { RetrievedChunk } from "./retrieval";

/**
 * Reciprocal Rank Fusion (RRF) merge.
 *
 * Why RRF over simple score normalization?
 * - Vector scores and BM25 scores are on incompatible scales (cosine 0–1
 *   vs ts_rank 0–∞). Normalizing requires knowing the score distribution.
 * - RRF only uses rank position, making it scale-invariant and robust
 *   when one system has no results.
 * - Empirically shown to match or beat learned fusion in most RAG setups
 *   at zero additional complexity.
 *
 * k=60 is the standard RRF constant (from the original Cormack et al. paper).
 * Increasing k smooths rank differences; decreasing k amplifies them.
 */
export function rrf(
  resultSets: RetrievedChunk[][],
  topK = 5,
  k = 60
): RetrievedChunk[] {
  // Map: chunkId → { chunk, rrfScore }
  const scores = new Map<string, { chunk: RetrievedChunk; rrfScore: number }>();

  for (const results of resultSets) {
    results.forEach((chunk, rank) => {
      const contribution = 1 / (k + rank + 1);
      const existing = scores.get(chunk.id);
      if (existing) {
        existing.rrfScore += contribution;
        // Keep the highest individual score for confidence calculation
        if (chunk.score > existing.chunk.score) {
          existing.chunk = { ...chunk, score: chunk.score };
        }
      } else {
        scores.set(chunk.id, { chunk, rrfScore: contribution });
      }
    });
  }

  return Array.from(scores.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, topK)
    .map(({ chunk }) => chunk);
}

/**
 * Confidence label based on top retrieval score.
 *
 * These thresholds are based on cosine similarity with text-embedding-3-small:
 *   >0.7  → the retrieved chunk is highly relevant to the query
 *   0.5–0.7 → moderately relevant
 *   0.3–0.5 → weakly relevant (answer may be imprecise)
 *   <0.3  → no meaningful match — refuse to answer
 *
 * We also factor in the number of supporting chunks: if only 1 chunk
 * supports an answer (even at high similarity), cap at 'medium'.
 */
export function computeConfidence(
  chunks: RetrievedChunk[]
): { label: "high" | "medium" | "low" | "none"; score: number } {
  if (chunks.length === 0) return { label: "none", score: 0 };

  const topScore = chunks[0].score;

  let label: "high" | "medium" | "low" | "none";

  if (topScore < 0.3) {
    label = "none";
  } else if (topScore < 0.5) {
    label = "low";
  } else if (topScore < 0.7) {
    label = "medium";
  } else {
    // High similarity but only 1 supporting chunk → cap at medium
    label = chunks.length >= 2 ? "high" : "medium";
  }

  return { label, score: topScore };
}
