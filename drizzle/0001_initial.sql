-- ─── Enable pgvector ────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Tenants ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  storage_bytes   BIGINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email            TEXT NOT NULL UNIQUE,
  hashed_password  TEXT,
  name             TEXT,
  avatar_url       TEXT,
  role             TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','viewer')),
  email_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_tenant_idx ON users(tenant_id);

-- ─── Email tokens ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_sha256 TEXT NOT NULL UNIQUE,
  type         TEXT NOT NULL,   -- 'verify' | 'reset'
  expires_at   TIMESTAMPTZ NOT NULL,
  used         BOOLEAN NOT NULL DEFAULT FALSE
);

-- ─── Knowledge Bases ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_bases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name        TEXT NOT NULL,
  description TEXT,
  doc_count   INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kb_tenant_idx ON knowledge_bases(tenant_id);

-- ─── Documents ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kb_id            UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  uploaded_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name             TEXT NOT NULL,
  source_type      TEXT NOT NULL,   -- 'pdf'|'docx'|'txt'
  r2_key           TEXT,
  content_hash     TEXT,
  file_size_bytes  BIGINT NOT NULL DEFAULT 0,
  page_count       INTEGER,
  chunk_count      INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending',
  -- 'pending'|'processing'|'parsed'|'embedding'|'ready'|'failed'
  error_message    TEXT,
  chunk_size       INTEGER NOT NULL DEFAULT 512,
  chunk_overlap    INTEGER NOT NULL DEFAULT 64,
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  indexed_at       TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS documents_tenant_hash_idx ON documents(tenant_id, content_hash)
  WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS documents_status_idx     ON documents(tenant_id, kb_id, status);
CREATE INDEX IF NOT EXISTS documents_uploaded_at_idx ON documents(tenant_id, uploaded_at DESC);

-- ─── Chunks ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kb_id        UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  page_number  INTEGER,
  chunk_index  INTEGER NOT NULL,
  token_count  INTEGER NOT NULL,
  embedding    vector(1536),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chunks_tenant_kb_idx ON chunks(tenant_id, kb_id);
CREATE INDEX IF NOT EXISTS chunks_document_idx  ON chunks(document_id);

-- GIN index for full-text BM25 search
CREATE INDEX IF NOT EXISTS chunks_fts_idx
  ON chunks USING GIN (to_tsvector('english', content));

-- HNSW index for fast approximate nearest-neighbour vector search
-- m=16, ef_construction=64 are safe defaults for 1536-dim embeddings
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx
  ON chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── Conversations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kb_id       UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conversations_user_kb_idx ON conversations(user_id, kb_id, last_active DESC);
CREATE INDEX IF NOT EXISTS conversations_tenant_idx  ON conversations(tenant_id);

-- ─── Messages ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role                TEXT NOT NULL,   -- 'user' | 'assistant'
  content             TEXT NOT NULL,
  confidence          TEXT,            -- 'high'|'medium'|'low'|'none'
  confidence_score    REAL,
  latency_ms          INTEGER,
  prompt_tokens       INTEGER,
  completion_tokens   INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at ASC);

-- ─── Citations ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS citations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  chunk_id     UUID NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  doc_name     TEXT NOT NULL,
  page_number  INTEGER,
  excerpt      TEXT NOT NULL,
  score        REAL NOT NULL,
  rank         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS citations_message_idx ON citations(message_id);

-- ─── Usage Events ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type        TEXT NOT NULL,   -- 'embed'|'chat'|'eval'
  model             TEXT NOT NULL,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens      INTEGER NOT NULL DEFAULT 0,
  cost_usd          NUMERIC(10,6) NOT NULL DEFAULT 0,
  kb_id             UUID REFERENCES knowledge_bases(id) ON DELETE SET NULL,
  document_id       UUID REFERENCES documents(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS usage_events_tenant_time_idx ON usage_events(tenant_id, created_at DESC);

-- ─── Eval Datasets ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS eval_datasets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kb_id      UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eval_cases (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id       UUID NOT NULL REFERENCES eval_datasets(id) ON DELETE CASCADE,
  question         TEXT NOT NULL,
  expected_answer  TEXT,
  expected_doc_ids UUID[],
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eval_runs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id              UUID NOT NULL REFERENCES eval_datasets(id) ON DELETE CASCADE,
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label                   TEXT,
  avg_retrieval_relevance REAL,
  avg_context_relevance   REAL,
  avg_faithfulness        REAL,
  avg_answer_relevance    REAL,
  avg_citation_accuracy   REAL,
  passed_count            INTEGER,
  total_count             INTEGER,
  config                  JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS eval_runs_dataset_idx ON eval_runs(dataset_id, created_at DESC);

CREATE TABLE IF NOT EXISTS eval_results (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              UUID NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  case_id             UUID NOT NULL REFERENCES eval_cases(id) ON DELETE CASCADE,
  generated_answer    TEXT NOT NULL,
  retrieved_chunk_ids UUID[],
  retrieval_relevance REAL,
  context_relevance   REAL,
  faithfulness        REAL,
  answer_relevance    REAL,
  citation_accuracy   REAL,
  passed              BOOLEAN NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS eval_results_run_idx ON eval_results(run_id);
