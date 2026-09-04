import { rrf, computeConfidence } from "@/lib/search/rrf";
import type { RetrievedChunk } from "@/lib/search/retrieval";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeChunk(id: string, score: number, source: "vector" | "bm25" = "vector"): RetrievedChunk {
  return {
    id,
    documentId: "doc-1",
    docName: "test.pdf",
    content: `Content of chunk ${id}`,
    pageNumber: 1,
    chunkIndex: 0,
    score,
    source,
  };
}

// ── RRF tests ─────────────────────────────────────────────────────────────────

describe("rrf()", () => {
  test("empty result sets returns empty array", () => {
    expect(rrf([], 5)).toEqual([]);
    expect(rrf([[], []], 5)).toEqual([]);
  });

  test("single result set returns top-k items", () => {
    const chunks = [
      makeChunk("a", 0.9),
      makeChunk("b", 0.8),
      makeChunk("c", 0.7),
      makeChunk("d", 0.6),
    ];
    const result = rrf([chunks], 2);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("a");
    expect(result[1].id).toBe("b");
  });

  test("chunk appearing in both result sets ranks higher", () => {
    // chunk 'overlap' appears in both sets; 'only-vector' only in vector results
    const vectorResults = [makeChunk("overlap", 0.85), makeChunk("only-vector", 0.80)];
    const bm25Results = [makeChunk("overlap", 0.75), makeChunk("only-bm25", 0.70)];

    const result = rrf([vectorResults, bm25Results], 3);
    expect(result[0].id).toBe("overlap");
  });

  test("deduplicates chunks by id", () => {
    const chunk = makeChunk("dup", 0.9);
    const result = rrf([[chunk, chunk, chunk]], 5);
    const ids = result.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("respects topK limit", () => {
    const chunks = Array.from({ length: 20 }, (_, i) => makeChunk(`c${i}`, 1 - i * 0.04));
    const result = rrf([chunks], 5);
    expect(result).toHaveLength(5);
  });

  test("works when one result set is empty", () => {
    const chunks = [makeChunk("a", 0.9), makeChunk("b", 0.8)];
    const result = rrf([chunks, []], 5);
    expect(result).toHaveLength(2);
  });

  test("k=60 constant: position 0 contributes 1/61 ≈ 0.0164", () => {
    // Verify the RRF score for rank-0 in a single list is 1/(60+0+1) = 1/61
    // We can't inspect rrfScore directly, but we can assert rank ordering
    const chunks = [makeChunk("first", 0.5), makeChunk("second", 0.9)];
    // Even though 'second' has higher score, 'first' is rank-0 so it wins
    const result = rrf([chunks], 2);
    expect(result[0].id).toBe("first");
  });
});

// ── computeConfidence tests ────────────────────────────────────────────────────

describe("computeConfidence()", () => {
  test("empty chunks → none, score 0", () => {
    expect(computeConfidence([])).toEqual({ label: "none", score: 0 });
  });

  test("top score < 0.3 → none", () => {
    const { label, score } = computeConfidence([makeChunk("a", 0.25)]);
    expect(label).toBe("none");
    expect(score).toBeCloseTo(0.25);
  });

  test("top score 0.3–0.5 → low", () => {
    expect(computeConfidence([makeChunk("a", 0.4)]).label).toBe("low");
  });

  test("top score 0.5–0.7 → medium", () => {
    expect(computeConfidence([makeChunk("a", 0.6)]).label).toBe("medium");
  });

  test("top score ≥ 0.7, single chunk → medium (not high)", () => {
    // Only 1 supporting chunk caps at medium even at high similarity
    expect(computeConfidence([makeChunk("a", 0.85)]).label).toBe("medium");
  });

  test("top score ≥ 0.7, 2+ chunks → high", () => {
    const chunks = [makeChunk("a", 0.85), makeChunk("b", 0.75)];
    expect(computeConfidence(chunks).label).toBe("high");
  });

  test("score returned is the top chunk score", () => {
    const chunks = [makeChunk("a", 0.72), makeChunk("b", 0.60)];
    expect(computeConfidence(chunks).score).toBeCloseTo(0.72);
  });

  test("boundary: exactly 0.7 with 2 chunks → high", () => {
    const chunks = [makeChunk("a", 0.7), makeChunk("b", 0.65)];
    expect(computeConfidence(chunks).label).toBe("high");
  });

  test("boundary: exactly 0.5 → medium", () => {
    expect(computeConfidence([makeChunk("a", 0.5)]).label).toBe("medium");
  });

  test("boundary: exactly 0.3 → low", () => {
    expect(computeConfidence([makeChunk("a", 0.3)]).label).toBe("low");
  });
});
