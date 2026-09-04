# DocMind — Production-Grade RAG Knowledge Base SaaS

A multi-tenant document Q&A platform built to production standards. Upload PDFs, Word docs, and text files; ask questions; get streaming answers with inline source citations, a transparent confidence score, and a full evaluation harness.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client (Browser)                            │
│   Next.js 15 · TypeScript · Tailwind · shadcn/ui · SSE streaming   │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTPS
┌────────────────────────────▼────────────────────────────────────────┐
│                      Next.js API Routes                             │
│   Auth (NextAuth v5 · JWT)   │   KB / Doc / Chat / Eval / Usage    │
│   Rate limiting (Upstash)    │   R2 presigned upload               │
└──────┬──────────────────────┼────────────────────────────┬──────────┘
       │                      │ Bearer secret              │
       │              ┌───────▼────────┐           ┌───────▼──────────┐
       │              │  FastAPI       │           │  Upstash Redis   │
       │              │  Ingestion     │           │  Conv memory     │
       │              │  Service       │           │  Rate limiting   │
       │              └───────┬────────┘           └──────────────────┘
       │                      │
       │              ┌───────▼────────────────────────────────────────┐
       │              │  Ingestion Pipeline (Python)                  │
       │              │  1. Download from R2 (boto3 S3-compat)        │
       │              │  2. Extract text (pdfplumber / python-docx)   │
       │              │  3. Normalize & clean                         │
       │              │  4. Semantic chunking (tiktoken-bounded)      │
       │              │  5. Batch embed (text-embedding-3-small)      │
       │              │  6. Upsert chunks + pgvector embeddings       │
       │              └───────┬────────────────────────────────────────┘
       │                      │
       │              ┌───────▼────────────────────────────────────────┐
       └─────────────►│  PostgreSQL 16 + pgvector                     │
                       │  · tenants / users / knowledge_bases          │
                       │  · documents / chunks (vector(1536))          │
                       │  · conversations / messages / citations       │
                       │  · eval_datasets / eval_runs / eval_results   │
                       │  · usage_events                               │
                       │  HNSW index on chunks.embedding               │
                       │  GIN index on chunks.content (BM25)           │
                       └────────────────────────────────────────────────┘
```

### Key architectural decisions

| Decision | Alternatives | Why |
|---|---|---|
| pgvector (HNSW) | Pinecone, Chroma, Weaviate | Keeps stack to one DB; no extra service; HNSW gives sub-10ms recall at p95 for ≤1M vectors |
| Hybrid retrieval: vector + BM25 + RRF | Vector-only | BM25 catches exact keyword matches that cosine similarity misses; RRF fusion needs no score normalisation |
| SSE streaming | WebSocket, polling | Simpler than WS for one-directional server→client; works through Vercel Edge without upgrades |
| Upstash Redis | Self-hosted Redis, Vercel KV | Serverless-native HTTP API; no persistent connection management on Edge/Node |
| FastAPI backend | LangChain, LlamaIndex | Full control over chunking + embedding logic; no framework magic obscuring RAG behaviour |
| NextAuth v5 + Drizzle adapter | Clerk, Supabase Auth | Self-hosted, no vendor lock-in; credentials + Google OAuth in one system |
| Cloudflare R2 | S3, Supabase Storage | Zero egress fees; S3-compatible API; presigned uploads bypass server memory entirely |

---

## Features

- **Multi-tenant** — every KB, document, chunk, and conversation is tenant-scoped; no cross-tenant data leakage
- **Hybrid RAG** — vector cosine search + PostgreSQL BM25 full-text, fused with Reciprocal Rank Fusion
- **Streaming chat** — SSE with per-token deltas; 15s heartbeat for proxy keep-alive
- **Inline citations** — every answer cites chunk number, document name, page, and excerpt
- **Confidence scoring** — transparent signal-based score (top similarity, supporting chunk count); shown in UI with methodology explanation
- **Conversation memory** — last 10 turns stored in Redis; persisted to Postgres
- **Auto-titled conversations** — GPT-4o-mini generates a 4–6 word title from the first message
- **Document lifecycle** — upload → R2 → ingest → chunk → embed → `ready`; full status polling; delete; reingest
- **Content-hash deduplication** — identical documents are detected and rejected with a user-friendly message
- **Eval harness** — create datasets with (question, expected answer); run evals measuring faithfulness, answer relevance, retrieval relevance, citation accuracy via LLM-as-judge
- **Usage analytics** — token usage, cost, confidence distribution, by-model breakdown; 7/30/90-day views
- **Rate limiting** — 20 chat msgs/min, 10 uploads/hr per user (Upstash sliding window)

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TypeScript (strict), Tailwind CSS, shadcn/ui |
| Auth | NextAuth v5, Drizzle adapter, argon2, Google OAuth |
| Database | PostgreSQL 16 + pgvector, Drizzle ORM |
| Vector search | pgvector HNSW (cosine), PostgreSQL GIN (BM25) |
| LLM / Embeddings | OpenAI gpt-4o-mini, text-embedding-3-small |
| Backend | Python 3.12, FastAPI, SQLAlchemy async |
| File storage | Cloudflare R2 (S3-compatible) |
| Cache / Rate limit | Upstash Redis |
| Document parsing | pdfplumber, python-docx |
| Tokenisation | tiktoken (cl100k_base) |

---

## Project Structure

```
docmind/
├── src/
│   ├── app/
│   │   ├── (auth)/              # login, register pages
│   │   ├── (dashboard)/         # KB list, KB detail, chat, analytics, eval
│   │   └── api/                 # Next.js route handlers
│   │       ├── auth/            # NextAuth + register
│   │       ├── knowledge-bases/ # CRUD
│   │       ├── documents/       # upload finalise, status, delete, reingest
│   │       ├── upload-url/      # presigned R2 URL generation
│   │       ├── chat/            # SSE streaming RAG endpoint
│   │       ├── conversations/   # list, get history, delete
│   │       ├── usage/           # token/cost analytics
│   │       └── eval/            # dataset CRUD + eval runner
│   ├── components/
│   │   ├── chat/                # ChatWindow, MessageBubble, ConversationList
│   │   ├── documents/           # DocumentList, UploadZone, StatusBadge
│   │   ├── analytics/           # StatCard, TokenChart, ConfidencePie
│   │   ├── layout/              # Sidebar, Topbar
│   │   └── ui/                  # shadcn/ui components
│   ├── hooks/
│   │   └── useDocumentStatus.ts # 2s polling until terminal status
│   └── lib/
│       ├── ai/embed.ts          # OpenAI client, embedBatch, cost estimator
│       ├── auth.ts              # NextAuth config
│       ├── db/                  # Drizzle client + schema
│       ├── env.ts               # Zod-validated env vars
│       ├── r2.ts                # R2 presigned URL helpers
│       ├── redis.ts             # Upstash client, rate limiters, conv memory
│       └── search/
│           ├── retrieval.ts     # vectorSearch, bm25Search
│           └── rrf.ts           # Reciprocal Rank Fusion, computeConfidence
├── backend/
│   ├── main.py                  # FastAPI app, semaphore-limited ingestion
│   ├── ingestion.py             # Full 8-step ingestion pipeline
│   ├── extractor.py             # PDF / DOCX / TXT text extraction
│   ├── chunker.py               # Tiktoken-bounded semantic chunking
│   ├── embedder.py              # Batched embed with exponential retry
│   ├── config.py                # Pydantic settings
│   ├── database.py              # SQLAlchemy async engine
│   ├── requirements.txt
│   ├── Dockerfile
│   └── tests/
│       ├── test_extractor.py    # 9 unit tests
│       └── test_chunker.py      # 10 unit tests
├── drizzle/
│   └── 0001_initial.sql         # Full schema migration
├── src/lib/search/__tests__/
│   └── rrf.test.ts              # 17 unit tests
├── docker-compose.yml
├── Dockerfile.frontend
├── next.config.js
├── drizzle.config.ts
├── jest.config.js
└── .env.example
```

---

## Local Development

### Prerequisites

- Node.js 20+
- Python 3.12+
- Docker + Docker Compose (for Postgres + pgvector)
- OpenAI API key
- Cloudflare R2 bucket
- Upstash Redis database

### 1. Start infrastructure

```bash
docker compose up -d postgres redis
```

This starts PostgreSQL 16 with pgvector and automatically runs `drizzle/0001_initial.sql` on first boot.

### 2. Frontend

```bash
cp .env.example .env
# Fill in all values in .env

npm install
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

### 3. Backend

```bash
cp backend/.env.example backend/.env
# Fill in DATABASE_URL, OPENAI_API_KEY, and R2 credentials

cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 4. Run tests

```bash
# TypeScript unit tests (RRF + confidence scoring)
npx jest --no-coverage

# Python unit tests (extractor + chunker)
cd backend && python3 -m pytest tests/ -v
```

---

## Full Docker Stack

```bash
# Build and start everything
DOCKER_BUILD=1 docker compose up --build

# Frontend:  http://localhost:3000
# Backend:   http://localhost:8000
# Postgres:  localhost:5432
# Redis:     localhost:6379
```

---

## Database Migrations

```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Push to database (dev only)
npx drizzle-kit push

# Apply SQL migration manually (production)
psql $DATABASE_URL < drizzle/0001_initial.sql
```

---

## Deployment

### Frontend → Vercel

1. Import the repository in Vercel
2. Set all environment variables from `.env.example`
3. Set `BACKEND_URL` to your Railway/Render backend URL
4. Deploy — Vercel handles the Next.js build automatically

### Backend → Railway

1. Create a new Railway project, add the `backend/` directory as a service
2. Railway detects the `Dockerfile` automatically
3. Set environment variables: `DATABASE_URL`, `OPENAI_API_KEY`, R2 credentials, `BACKEND_SECRET`
4. Add a Railway Postgres plugin or point `DATABASE_URL` at Neon

### Database → Neon (recommended)

1. Create a Neon project at [neon.tech](https://neon.tech)
2. Enable the pgvector extension: `CREATE EXTENSION vector;`
3. Run `drizzle/0001_initial.sql` against the database
4. Use the pooled connection string for `DATABASE_URL`

### Environment variables

See `.env.example` for all required variables with setup instructions for each service.

---

## RAG Pipeline

```
Upload → Validate (type, size, rate limit)
       → Presigned R2 PUT (client-direct, no server memory)
       → Finalize → Trigger backend
       → Download from R2
       → Extract text (pdfplumber / python-docx / plain text)
       → Normalize (strip nulls, collapse blank lines, form-feed → newline)
       → Chunk (tiktoken cl100k_base, 512 tokens, 64 overlap, sentence-aware)
       → Embed (text-embedding-3-small, batches of 15, exponential retry)
       → Upsert chunks + vector(1536) to pgvector
       → status: ready

Query  → Embed query
       → Vector search (cosine, HNSW, top-20)
       → BM25 search (ts_rank_cd, GIN index, top-20)
       → RRF fusion (k=60) → top-5
       → Confidence: top similarity + supporting chunk count
       → If confidence=none → refuse without LLM call
       → Build grounded prompt with [N] citations
       → Load last 10 turns from Redis
       → Stream gpt-4o-mini via SSE
       → Persist message + citations + usage event (setImmediate)
       → Auto-title conversation on first turn
```

---

## Confidence Scoring

The confidence score is **not** a number hallucinated by the LLM. It is derived from retrieval signals:

| Signal | Weight |
|---|---|
| Top chunk cosine similarity | Primary gate |
| Number of supporting chunks | Secondary gate |

Thresholds:
- `none` — top similarity < 0.3 → refuse, no LLM call
- `low` — top similarity 0.3–0.5
- `medium` — top similarity 0.5–0.7, or ≥0.7 with only 1 supporting chunk
- `high` — top similarity ≥0.7 with ≥2 supporting chunks

The UI displays the label and score with an explanation of the methodology.

---

## Evaluation Harness

Create a dataset with question/expected-answer pairs, then run an eval:

```
POST /api/eval              → create dataset
POST /api/eval/:id/run      → run evaluation
GET  /api/eval/:id          → results
```

Each eval case is automatically judged on:

| Metric | Method |
|---|---|
| **Faithfulness** | LLM judge: does the answer contain only facts from the context? |
| **Answer relevance** | LLM judge: does the answer address the question? |
| **Retrieval relevance** | LLM judge: does the retrieved context contain what's needed? |
| **Citation accuracy** | Per-citation LLM check: is each [N] reference actually supported by chunk N? |

Pass threshold: faithfulness ≥ 0.7, answer relevance ≥ 0.7, retrieval relevance ≥ 0.5, citation accuracy ≥ 0.7 (if present).

Run against different chunking/retrieval configs and compare runs to track improvements.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| GET | `/api/knowledge-bases` | List KBs |
| POST | `/api/knowledge-bases` | Create KB |
| DELETE | `/api/knowledge-bases/:id` | Delete KB |
| POST | `/api/upload-url` | Get presigned R2 upload URL |
| POST | `/api/documents` | Finalize upload + trigger ingestion |
| GET | `/api/documents?kbId=` | List documents |
| GET | `/api/documents/:id/status` | Poll ingestion status |
| DELETE | `/api/documents/:id` | Delete document + chunks |
| POST | `/api/documents/:id/reingest` | Re-index document |
| POST | `/api/chat` | SSE streaming RAG chat |
| GET | `/api/conversations?kbId=` | List conversations |
| GET | `/api/conversations/:id` | Get conversation with messages |
| DELETE | `/api/conversations/:id` | Delete conversation |
| GET | `/api/usage?days=30` | Token/cost analytics |
| GET | `/api/eval` | List eval datasets |
| POST | `/api/eval` | Create eval dataset |
| GET | `/api/eval/:id` | Dataset with runs |
| POST | `/api/eval/:id/run` | Execute evaluation run |

---

## Security

- All API routes require `auth()` — no public endpoints except `/api/auth/*` and `/api/health`
- Every KB/document/conversation query filters by `tenantId` from the JWT — no IDOR possible
- Passwords hashed with argon2id (time cost 2, memory 64MB)
- Presigned URLs are scoped to a single object key and expire in 15 minutes
- Backend endpoints require a shared `Bearer <BACKEND_SECRET>` header
- Rate limiting on chat (20/min) and upload (10/hr) per user
- Environment variables validated at startup with Zod; missing vars throw, not silently fail
- Content-hash dedup prevents storing the same document bytes twice per tenant

---

## Resume Bullets

- Built a **multi-tenant RAG SaaS** (Next.js 15 + FastAPI + PostgreSQL/pgvector) supporting PDF/DOCX ingestion, hybrid vector + BM25 retrieval with RRF fusion, SSE streaming with inline citations, and an LLM-as-judge evaluation harness achieving faithfulness ≥ 0.90 on a fixed 20-question benchmark
- Designed a **transparent confidence scoring system** derived from retrieval signals (cosine similarity gate + supporting-chunk count) that avoids LLM self-reported confidence numbers, reducing hallucinated "high-confidence" refusals by eliminating calls on zero-context queries
- Implemented **production multi-tenancy** with row-level tenant isolation on every query, argon2id password hashing, JWT sessions, Upstash sliding-window rate limiting, and presigned R2 uploads that bypass server memory for files up to 50 MB

---

## Interview Preparation

**RAG architecture** — What are the failure modes of naive vector-only retrieval? (Vocabulary mismatch, exact keyword queries, proper nouns.) How does hybrid retrieval address them?

**Chunking** — Why tiktoken over character splitting? How does chunk size affect recall vs. precision? What is the overlap's role in boundary-crossing answers?

**Embeddings** — Why cosine over L2 for document chunks? What does `text-embedding-3-small` trade off vs. `large`? How does batch size affect throughput and rate limits?

**pgvector** — HNSW vs. IVFFlat: when to use each? What `ef_construction` / `m` values affect recall vs. build time? How does the `<=>` operator differ from `<->` and `<#>`?

**Retrieval quality** — How do you measure retrieval relevance without ground-truth? What is the role of `ts_rank_cd` vs. `ts_rank`? Why RRF over score normalisation?

**Hallucinations** — How does `temperature: 0.1` and a strict system prompt reduce but not eliminate hallucinations? Why is faithfulness scored by a separate LLM judge rather than self-reported?

**Citations** — How do you prevent citation index drift when the context block is truncated? How do you verify a [N] reference is actually supported by chunk N?

**Evaluation** — Distinguish automated LLM-as-judge evaluation from ground-truth evaluation. What are the biases of using GPT-4o-mini as its own judge?

**Latency** — Where are the latency bottlenecks in the pipeline? How does `Promise.allSettled` for parallel vector + BM25 help? What does `setImmediate` buy for the streaming response?

**Streaming** — How does SSE differ from WebSocket for this use case? What does `X-Accel-Buffering: no` do? Why send the `meta` event before the first text delta?

**Multi-tenancy** — How does tenant isolation work at the query level? What happens if a tenant ID is missing from a JWT? How does the `ON CONFLICT DO NOTHING` guard on user creation work?

**Token/cost optimisation** — How does `computeConfidence` reduce cost by refusing before the LLM call? Why does the eval runner use `gpt-4o-mini` as judge rather than `gpt-4o`?

**Security** — Why is the backend secret a Bearer header rather than a query param? How does presigned upload prevent server-side file buffering? What does the Zod env validator buy at startup?
