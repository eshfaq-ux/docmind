import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export interface RetrievedChunk {
  id: string;
  documentId: string;
  docName: string;
  content: string;
  pageNumber: number | null;
  chunkIndex: number;
  score: number;
  source: "vector" | "bm25" | "kg";
}

/**
 * Vector similarity search using pgvector cosine distance.
 * Returns top-k chunks ordered by similarity descending.
 *
 * Why cosine over L2? Cosine is magnitude-invariant — a long chunk and
 * a short chunk with the same semantic content score equally.
 */
export async function vectorSearch(
  tenantId: string,
  kbId: string,
  queryEmbedding: number[],
  topK = 20
): Promise<RetrievedChunk[]> {
  const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

  // Raw SQL required for pgvector operator (<=>  = cosine distance)
  // 1 - distance = cosine similarity
  const rows = await db.execute(sql`
    SELECT
      c.id,
      c.document_id,
      d.name  AS doc_name,
      c.content,
      c.page_number,
      c.chunk_index,
      1 - (c.embedding <=> ${embeddingLiteral}::vector) AS score
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE
      c.tenant_id = ${tenantId}::uuid
      AND c.kb_id   = ${kbId}::uuid
      AND c.embedding IS NOT NULL
      AND d.status IN ('ready', 'distilling', 'distilled')
    ORDER BY c.embedding <=> ${embeddingLiteral}::vector
    LIMIT ${topK}
  `);

  const rowsArr = ((rows as unknown) as { rows: Record<string, unknown>[] }).rows;
  return rowsArr.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as string,
      documentId: row.document_id as string,
      docName: row.doc_name as string,
      content: row.content as string,
      pageNumber: row.page_number as number | null,
      chunkIndex: row.chunk_index as number,
      score: Number(row.score),
      source: "vector" as const,
    };
  });
}

/**
 * BM25-style full-text search using PostgreSQL's ts_rank_cd.
 *
 * Why ts_rank_cd over ts_rank? ts_rank_cd uses cover density ranking
 * which weights terms appearing close together more heavily — better
 * for factual Q&A where proximity of answer tokens matters.
 *
 * Uses the stored content_tsv generated column (added in migration 0002)
 * instead of computing to_tsvector() at query time — avoids full recompute
 * on every row scan and allows the GIN index to be used.
 *
 * websearch_to_tsquery instead of plainto_tsquery: handles quoted phrases
 * ("machine learning") and OR operators, meaningfully better for technical Q&A.
 */
export async function bm25Search(
  tenantId: string,
  kbId: string,
  query: string,
  topK = 20
): Promise<RetrievedChunk[]> {
  const rows = await db.execute(sql`
    SELECT
      c.id,
      c.document_id,
      d.name  AS doc_name,
      c.content,
      c.page_number,
      c.chunk_index,
      ts_rank_cd(
        c.content_tsv,
        websearch_to_tsquery('english', ${query})
      ) AS score
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE
      c.tenant_id = ${tenantId}::uuid
      AND c.kb_id   = ${kbId}::uuid
      AND c.content_tsv @@ websearch_to_tsquery('english', ${query})
      AND d.status IN ('ready', 'distilling', 'distilled')
    ORDER BY score DESC
    LIMIT ${topK}
  `);

  const rowsArr2 = ((rows as unknown) as { rows: Record<string, unknown>[] }).rows;
  return rowsArr2.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as string,
      documentId: row.document_id as string,
      docName: row.doc_name as string,
      content: row.content as string,
      pageNumber: row.page_number as number | null,
      chunkIndex: row.chunk_index as number,
      score: Number(row.score),
      source: "bm25" as const,
    };
  });
}
