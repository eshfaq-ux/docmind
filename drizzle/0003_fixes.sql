-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0003: Post-HERALD fixes
--
-- Addresses gaps left after 0002_herald.sql:
--
--   1. HNSW index rebuild — 0001 created chunks_embedding_hnsw_idx for
--      vector(1536). After 0002 alters the column to vector(768), the index
--      dimension no longer matches. Drop and recreate it.
--
--   2. documents.status comment — the inline comment in 0001 does not list
--      the HERALD statuses ('distilling', 'distilled'). Add a CHECK constraint
--      to enforce the full allowed set and self-document the column.
--
--   3. users table index — users_tenant_idx was created outside the CREATE TABLE
--      in 0001 but is missing from the IF NOT EXISTS guard; harmless on a fresh
--      DB but the explicit guard prevents errors on re-runs.
--
-- Safe to apply to a running database with zero data loss.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Rebuild HNSW index for vector(768) ───────────────────────────────────
-- The old index was built on vector(1536) and is now stale after the column
-- type was changed in 0002. PostgreSQL will not automatically rebuild it.
-- Drop it first (IF EXISTS guards idempotency), then recreate for 768-dim.

DROP INDEX IF EXISTS chunks_embedding_hnsw_idx;

CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx
  ON chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── 2. Enforce documents.status allowed values ───────────────────────────────
-- 0001 left status as a free-text column with only a comment listing values.
-- Add a CHECK constraint that includes the HERALD statuses added in 0002.
-- The DO block makes this idempotent — safe on DBs that already have the check.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name       = 'documents'
      AND constraint_type  = 'CHECK'
      AND constraint_name  = 'documents_status_check'
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_status_check
      CHECK (status IN (
        'pending', 'processing', 'parsed', 'embedding',
        'ready', 'distilling', 'distilled', 'failed'
      ));
  END IF;
END $$;

-- ─── 3. Ensure users index exists (idempotent guard) ─────────────────────────
CREATE INDEX IF NOT EXISTS users_tenant_idx ON users(tenant_id);
