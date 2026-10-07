import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import type { RetrievedChunk } from "./retrieval";

/**
 * HERALD Hot Layer — KG node search.
 *
 * Searches kg_nodes using two complementary signals:
 *   1. Cosine similarity on node embeddings (same model as chunks: nomic-embed-text 768d)
 *   2. Keyword match on title and tags (cheaper than full BM25, sufficient for structured nodes)
 *
 * KG nodes represent pre-validated, structured knowledge distilled from document chunks.
 * They are preferred over raw chunks when relevance is comparable — the RRF sourceBoost
 * in rrf.ts handles this preference automatically.
 *
 * Nodes are converted to RetrievedChunk shape so the rest of the pipeline
 * (RRF, confidence scoring, context building, citation) is source-agnostic.
 * The source field is set to "kg" to enable boost routing in rrf().
 */

export interface KGNode {
  id: string;
  type: string;
  title: string;
  description: string;
  tags: string[];
  documentId: string | null;
  chunkIds: string[];
  confidence: number;
  score: number;
  needsReview: boolean;
}

/**
 * Search kg_nodes by vector similarity for a given KB.
 * Falls back gracefully to empty array if no nodes exist yet.
 */
export async function kgSearch(
  tenantId: string,
  kbId: string,
  queryEmbedding: number[],
  topK = 10
): Promise<RetrievedChunk[]> {
  // Return early if embedding is empty (safety guard)
  if (!queryEmbedding.length) return [];

  const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

  const rows = await db.execute(sql`
    SELECT
      n.id,
      n.type,
      n.title,
      n.description,
      n.tags,
      n.document_id,
      n.chunk_ids,
      n.confidence,
      n.needs_review,
      -- Use node confidence as a floor: KG nodes are pre-validated so their
      -- effective score is the max of cosine similarity and their confidence.
      -- This ensures high-confidence nodes are never filtered by computeConfidence.
      GREATEST(
        1 - (n.embedding <=> ${embeddingLiteral}::vector),
        n.confidence * 0.85
      ) AS score
    FROM kg_nodes n
    WHERE
      n.tenant_id  = ${tenantId}::uuid
      AND n.kb_id  = ${kbId}::uuid
      AND n.embedding IS NOT NULL
      AND n.needs_review = FALSE
    ORDER BY n.embedding <=> ${embeddingLiteral}::vector
    LIMIT ${topK}
  `);

  const rowsArr = ((rows as unknown) as { rows: Record<string, unknown>[] }).rows;
  return rowsArr.map((r) => nodeRowToChunk(r as Record<string, unknown>));
}

/**
 * Search kg_nodes by keyword match on title and tags.
 * Used as a supplementary signal alongside vector search —
 * catches exact concept name matches that embedding similarity might miss.
 */
export async function kgKeywordSearch(
  tenantId: string,
  kbId: string,
  query: string,
  topK = 5
): Promise<RetrievedChunk[]> {
  if (!query.trim()) return [];

  const rows = await db.execute(sql`
    SELECT
      n.id,
      n.type,
      n.title,
      n.description,
      n.tags,
      n.document_id,
      n.chunk_ids,
      n.confidence,
      n.needs_review,
      -- Score: exact title match scores highest, partial tag match scores lower
      CASE
        WHEN lower(n.title) = lower(${query})            THEN 0.95
        WHEN lower(n.title) LIKE lower(${'%' + query + '%'}) THEN 0.80
        ELSE 0.65
      END AS score
    FROM kg_nodes n
    WHERE
      n.tenant_id = ${tenantId}::uuid
      AND n.kb_id = ${kbId}::uuid
      AND n.needs_review = FALSE
      AND (
        lower(n.title) LIKE lower(${'%' + query + '%'})
        OR n.tags && ARRAY(
             SELECT unnest(string_to_array(lower(${query}), ' '))
           )::text[]
      )
    ORDER BY score DESC
    LIMIT ${topK}
  `);

  const rowsArr = ((rows as unknown) as { rows: Record<string, unknown>[] }).rows;
  return rowsArr.map((r) => nodeRowToChunk(r as Record<string, unknown>));
}

/**
 * Convert a kg_nodes DB row into the RetrievedChunk shape used throughout
 * the retrieval pipeline. This keeps the chat route and RRF logic source-agnostic.
 *
 * Content is formatted as: "[type] Title\n\nDescription"
 * This gives the LLM structured context while keeping the chunk readable.
 */
function nodeRowToChunk(row: Record<string, unknown>): RetrievedChunk {
  const type = (row.type as string) ?? "concept";
  const title = (row.title as string) ?? "";
  const description = (row.description as string) ?? "";

  // Format the node as readable context for the LLM
  const content = `[${type.toUpperCase()}] ${title}\n\n${description}`;

  return {
    // Use node id as chunk id — unique within the retrieval pipeline
    id: row.id as string,
    // document_id may be null if the node was synthesised from multiple docs
    documentId: (row.document_id as string | null) ?? "",
    // docName carries the node title for citation display
    docName: title,
    content,
    // KG nodes don't have page numbers — they are document-level concepts
    pageNumber: null,
    // chunkIndex -1 signals "KG node" to any downstream code that inspects it
    chunkIndex: -1,
    score: Number(row.score),
    source: "kg" as const,
  };
}

/**
 * Fetch full KG node details by id (used by the KG Explorer UI and citation expansion).
 */
export async function getKGNode(
  tenantId: string,
  nodeId: string
): Promise<KGNode | null> {
  const rows = await db.execute(sql`
    SELECT
      id, type, title, description, tags,
      document_id, chunk_ids, confidence, needs_review
    FROM kg_nodes
    WHERE id = ${nodeId}::uuid AND tenant_id = ${tenantId}::uuid
    LIMIT 1
  `);

  const rowsArr = ((rows as unknown) as { rows: Record<string, unknown>[] }).rows;
  if (!rowsArr.length) return null;

  const r = rowsArr[0];
  return {
    id: r.id as string,
    type: r.type as string,
    title: r.title as string,
    description: r.description as string,
    tags: (r.tags as string[]) ?? [],
    documentId: r.document_id as string | null,
    chunkIds: (r.chunk_ids as string[]) ?? [],
    confidence: Number(r.confidence),
    score: 0,
    needsReview: Boolean(r.needs_review),
  };
}
