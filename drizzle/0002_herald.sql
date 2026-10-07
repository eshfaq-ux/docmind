-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0002: HERALD — Hybrid Evolving Retrieval with Auto-distilled Living Data
--
-- This migration is purely additive. No existing columns are modified or dropped.
-- Safe to apply to a running production database.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Extensions ──────────────────────────────────────────────────────────────

-- pg_trgm: required for title-similarity deduplication in distiller.py
-- (similarity() function used to detect near-duplicate KG node titles)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Modify: chunks ───────────────────────────────────────────────────────────

-- Track how often each chunk is retrieved across all queries.
-- Used by the Promoter job to identify "hot" chunks worth promoting to KG nodes.
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS retrieval_count   INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retrieved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parent_chunk_id   UUID        REFERENCES chunks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_promoted       BOOLEAN     NOT NULL DEFAULT FALSE;

-- Stored tsvector for BM25 full-text search.
-- Previously computed at query time (to_tsvector on every row scan) — expensive.
-- Now stored and indexed; updated automatically on content change.
-- Fixes the double-computation bug and enables GIN index usage.
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS content_tsv TSVECTOR
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX IF NOT EXISTS chunks_content_tsv_idx
  ON chunks USING GIN(content_tsv);

CREATE INDEX IF NOT EXISTS chunks_retrieval_count_idx
  ON chunks(tenant_id, kb_id, retrieval_count DESC)
  WHERE is_promoted = FALSE;

-- ─── Modify: documents ───────────────────────────────────────────────────────

-- Fields populated by the Distillation Engine after ingestion completes.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS summary      TEXT,
  ADD COLUMN IF NOT EXISTS tags         TEXT[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS doc_type     TEXT,
  -- doc_type values: contract|report|policy|invoice|manual|technical|legal|other
  ADD COLUMN IF NOT EXISTS distilled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS node_count   INTEGER     NOT NULL DEFAULT 0;

-- ─── New table: kg_nodes ─────────────────────────────────────────────────────
-- OKF-style structured knowledge nodes, auto-distilled from document chunks.
-- These form the "Hot Layer" of the HERALD architecture.
--
-- Node types:
--   concept     — abstract idea or domain term
--   entity      — named person, org, product, place
--   definition  — formal definition of a term
--   fact        — specific stated fact or figure
--   procedure   — step-by-step process
--   requirement — stated obligation or constraint

CREATE TABLE IF NOT EXISTS kg_nodes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id)          ON DELETE CASCADE,
  kb_id           UUID        NOT NULL REFERENCES knowledge_bases(id)  ON DELETE CASCADE,
  document_id     UUID                 REFERENCES documents(id)        ON DELETE SET NULL,
  chunk_ids       UUID[]      NOT NULL DEFAULT '{}',
  -- type: one of concept|entity|definition|fact|procedure|requirement
  type            TEXT        NOT NULL,
  title           TEXT        NOT NULL,
  description     TEXT        NOT NULL,
  tags            TEXT[]      NOT NULL DEFAULT '{}',
  -- relationships: JSON array of { target_title: str, relationship: str }
  -- stored as JSONB for queryability without a full join table for simple cases
  relationships   JSONB       NOT NULL DEFAULT '[]',
  -- 768-dim embedding (nomic-embed-text, same model as chunks)
  -- allows KG nodes to be searched with the same cosine operator as chunks
  embedding       VECTOR(768),
  retrieval_count INTEGER     NOT NULL DEFAULT 0,
  -- confidence: 0.0-1.0; auto-generated nodes start at 0.85, manually edited = 1.0
  confidence      REAL        NOT NULL DEFAULT 0.85,
  -- needs_review: set true by contradiction detector when new docs conflict
  needs_review    BOOLEAN     NOT NULL DEFAULT FALSE,
  review_reason   TEXT,
  -- auto_generated: false if user manually created or edited this node
  auto_generated  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kg_nodes_tenant_kb_idx
  ON kg_nodes(tenant_id, kb_id);

CREATE INDEX IF NOT EXISTS kg_nodes_type_idx
  ON kg_nodes(tenant_id, kb_id, type);

CREATE INDEX IF NOT EXISTS kg_nodes_tags_idx
  ON kg_nodes USING GIN(tags);

CREATE INDEX IF NOT EXISTS kg_nodes_needs_review_idx
  ON kg_nodes(tenant_id, kb_id, needs_review)
  WHERE needs_review = TRUE;

-- Title trigram index for similarity-based deduplication in distiller.py
-- Enables: WHERE similarity(lower(title), lower($new_title)) > 0.7
CREATE INDEX IF NOT EXISTS kg_nodes_title_trgm_idx
  ON kg_nodes USING GIN(lower(title) gin_trgm_ops);

-- HNSW index for vector search (run AFTER first batch of nodes is inserted;
-- HNSW build requires data to exist for optimal index construction):
--
-- CREATE INDEX CONCURRENTLY kg_nodes_embedding_hnsw_idx
--   ON kg_nodes USING hnsw(embedding vector_cosine_ops)
--   WITH (m = 16, ef_construction = 64);
--
-- Run this manually after documents are distilled, not during migration.

-- ─── New table: kg_edges ─────────────────────────────────────────────────────
-- Directed edges between KG nodes, forming the knowledge graph.
-- Relationship types: defines|references|contradicts|extends|requires|part_of

CREATE TABLE IF NOT EXISTS kg_edges (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id)         ON DELETE CASCADE,
  kb_id        UUID        NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  from_node_id UUID        NOT NULL REFERENCES kg_nodes(id)        ON DELETE CASCADE,
  to_node_id   UUID        NOT NULL REFERENCES kg_nodes(id)        ON DELETE CASCADE,
  relationship TEXT        NOT NULL,
  weight       REAL        NOT NULL DEFAULT 1.0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate edges between the same node pair with the same relationship
  CONSTRAINT kg_edges_unique UNIQUE (from_node_id, to_node_id, relationship)
);

CREATE INDEX IF NOT EXISTS kg_edges_from_idx ON kg_edges(from_node_id);
CREATE INDEX IF NOT EXISTS kg_edges_to_idx   ON kg_edges(to_node_id);
CREATE INDEX IF NOT EXISTS kg_edges_kb_idx   ON kg_edges(tenant_id, kb_id);
