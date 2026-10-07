# HERALD — Hybrid Evolving Retrieval with Auto-distilled Living Data

> **Architecture specification for DocMind v2.0**  
> Status: `APPROVED — Implementation Ready`  
> Last updated: 2026-10-07

---

## Table of Contents

1. [Overview](#1-overview)
2. [Why HERALD](#2-why-herald)
3. [Architecture Diagram](#3-architecture-diagram)
4. [Layer Definitions](#4-layer-definitions)
5. [Data Model](#5-data-model)
6. [Ingestion Pipeline Changes](#6-ingestion-pipeline-changes)
7. [Retrieval Pipeline Changes](#7-retrieval-pipeline-changes)
8. [Self-Improvement Loop](#8-self-improvement-loop)
9. [Contradiction Detection](#9-contradiction-detection)
10. [API Changes](#10-api-changes)
11. [Frontend Changes](#11-frontend-changes)
12. [Implementation Plan](#12-implementation-plan)
13. [File Map](#13-file-map)
14. [Configuration Reference](#14-configuration-reference)
15. [Testing Strategy](#15-testing-strategy)
16. [Known Constraints and Ceilings](#16-known-constraints-and-ceilings)

---

## 1. Overview

HERALD is a dual-layer knowledge architecture that combines the strengths of modern RAG systems with OKF-style structured knowledge, while eliminating the key weaknesses of each:

| System | Strength | Weakness |
|--------|----------|----------|
| RAG | Handles large, unstructured, dynamic documents | Re-retrieves same facts every query; chunks lack structure; no learning |
| OKF | Persistent, structured, human+AI readable, version-controlled | Requires manual curation; no built-in retrieval; goes stale |
| **HERALD** | **Both** | — |

**The core insight:** OKF's structured knowledge layer should not be manually maintained — it should be *automatically distilled* from RAG usage over time, and the two layers should continuously inform each other.

### What HERALD does that no existing system does

1. **Auto-distillation** — documents uploaded by users become structured knowledge nodes automatically, no manual curation
2. **Promotion by frequency** — chunks retrieved 3+ times across conversations are promoted to first-class structured knowledge
3. **Unified scoring** — KG nodes and raw chunks compete in the same RRF pass; nodes get a confidence boost
4. **Self-healing** — when new documents contradict existing KG nodes, the system flags them rather than serving stale facts
5. **Single pipeline, single schema** — not two systems bolted together; one Postgres schema, one ingestion flow, one retrieval function

---

## 2. Why HERALD

### Current DocMind limitations

The existing system (as of v1) has these specific gaps:

- `chat/route.ts` embeds the raw user question, not a hypothetical answer (vocabulary mismatch)
- Every query re-retrieves and re-embeds even for facts asked dozens of times
- Retrieved chunks are raw text with no structure, relationships, or metadata
- The knowledge in a KB never improves after initial ingestion
- No multi-hop reasoning capability (e.g. "what does the policy reference in section 3 say about X?")

### What HERALD adds

- A **Hot Layer** (KG) that serves pre-structured, pre-validated answers for common concepts
- A **Cold Layer** (existing RAG) that still handles first-contact and rare queries
- A **Routing Layer** that decides which layer answers each query and merges results
- A **Distillation Engine** that auto-populates the Hot Layer from the Cold Layer
- A **Promotion Job** that watches retrieval frequency and elevates hot chunks

---

## 3. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           HERALD Architecture                           │
└─────────────────────────────────────────────────────────────────────────┘

User Query
    │
    ▼
┌───────────────────────────────────────────────────────┐
│  ROUTING LAYER  (chat/route.ts — modified)            │
│  1. Extract entities from query                       │
│  2. Run KG search + RAG search in parallel            │
│  3. Merge via unified RRF (KG nodes get boost)        │
│  4. Record retrieval counts (async)                   │
└───────────┬───────────────────────────┬───────────────┘
            │                           │
    ┌───────▼───────┐           ┌───────▼───────┐
    │   HOT LAYER   │           │   COLD LAYER  │
    │  (KG / OKF)   │           │   (RAG)       │
    │               │           │               │
    │  kg_nodes     │           │  chunks       │
    │  kg_edges     │           │  vector idx   │
    │  Structured   │           │  BM25 idx     │
    │  Typed        │           │  Raw text     │
    │  Validated    │           │  Dynamic      │
    └───────┬───────┘           └───────┬───────┘
            │                           │
            └──────────┬────────────────┘
                       │
                       ▼
              Unified RRF Result → LLM → SSE Stream


INGESTION FLOW (backend)
─────────────────────────

Raw Document (PDF/DOCX/TXT)
    │
    ▼  [existing pipeline]
Extract → Normalize → Chunk → Embed → Upsert chunks
    │
    ▼  [NEW: post-ingest step]
Distillation Engine (distiller.py)
    │  ┌──────────────────────────────────────────────┐
    │  │  For representative sample of chunks:        │
    │  │  - Extract concepts via gpt-4o-mini          │
    │  │  - Write structured nodes to kg_nodes        │
    │  │  - Build edges between related nodes         │
    │  └──────────────────────────────────────────────┘
    │
    ▼
Document status: ready + distilled


SELF-IMPROVEMENT LOOP (background)
────────────────────────────────────

Every query:
  chunks.retrieval_count++  (setImmediate)

Every hour (Promoter job):
  chunks WHERE retrieval_count >= 3
  AND NOT already a KG node
    → distill → insert kg_nodes

On new document ingest:
  Compare new content against existing kg_nodes
    → flag contradictions → update kg_nodes.needs_review = true
```

---

## 4. Layer Definitions

### Cold Layer — RAG (existing, modified)

**What it handles:** All documents on first contact. Rare queries. Long-tail unstructured content.

**Components (existing):**
- `backend/ingestion.py` — extract, chunk, embed pipeline
- `src/lib/search/retrieval.ts` — `vectorSearch()` and `bm25Search()`
- `src/lib/search/rrf.ts` — `rrf()` and `computeConfidence()`
- `chunks` table — raw text chunks with 768-dim embeddings (nomic-embed-text)

**Changes required:**
- Add `retrieval_count` and `last_retrieved_at` columns to `chunks`
- Add `parent_chunk_id` column for small-to-big retrieval (Step 4)
- Fix BM25 to use stored `tsvector` generated column (performance fix)

### Hot Layer — Knowledge Graph / OKF-style (new)

**What it handles:** Stable, frequently-accessed facts. Multi-hop relational queries. Structured concepts.

**Components (new):**
- `backend/distiller.py` — concept extraction from chunks
- `src/lib/search/kg.ts` — `kgSearch()` function
- `kg_nodes` table — structured knowledge nodes (OKF-style)
- `kg_edges` table — relationships between nodes

**Node types:**
| Type | Description | Example |
|------|-------------|---------|
| `concept` | Abstract idea or domain term | "Indemnification clause" |
| `entity` | Named person, org, product, place | "Acme Corporation" |
| `definition` | Formal definition of a term | "Net Revenue means..." |
| `fact` | Specific stated fact or figure | "Contract value: $2.4M" |
| `procedure` | Step-by-step process | "Termination process" |
| `requirement` | Stated obligation or constraint | "30-day notice required" |

### Routing Layer — HERALD Retrieval (modified chat route)

**What it does:**
1. Embeds query (existing)
2. Runs `kgSearch()` + `vectorSearch()` + `bm25Search()` in parallel
3. Converts KG nodes to `RetrievedChunk` shape with confidence boost
4. Merges all three result sets via unified `rrf()`
5. Records retrieval counts asynchronously

---

## 5. Data Model

### New tables

#### `kg_nodes`

```sql
CREATE TABLE kg_nodes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kb_id           uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  document_id     uuid REFERENCES documents(id) ON DELETE SET NULL,
  chunk_ids       uuid[]  NOT NULL DEFAULT '{}',  -- source chunks
  type            text NOT NULL,                   -- concept|entity|definition|fact|procedure|requirement
  title           text NOT NULL,
  description     text NOT NULL,
  tags            text[] NOT NULL DEFAULT '{}',
  relationships   jsonb  NOT NULL DEFAULT '[]',    -- [{ target_title, relationship }]
  embedding       vector(768),                     -- nomic-embed-text, same as chunks
  retrieval_count integer NOT NULL DEFAULT 0,
  confidence      real    NOT NULL DEFAULT 1.0,
  needs_review    boolean NOT NULL DEFAULT false,  -- flagged by contradiction detector
  review_reason   text,
  auto_generated  boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX kg_nodes_tenant_kb_idx ON kg_nodes(tenant_id, kb_id);
CREATE INDEX kg_nodes_type_idx      ON kg_nodes(tenant_id, kb_id, type);
CREATE INDEX kg_nodes_tags_idx      ON kg_nodes USING GIN(tags);
-- HNSW index (run after data exists):
-- CREATE INDEX kg_nodes_embedding_idx ON kg_nodes
--   USING hnsw(embedding vector_cosine_ops)
--   WITH (m = 16, ef_construction = 64);
```

#### `kg_edges`

```sql
CREATE TABLE kg_edges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kb_id        uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  from_node_id uuid NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
  to_node_id   uuid NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
  relationship text NOT NULL,  -- defines|references|contradicts|extends|requires|part_of
  weight       real NOT NULL DEFAULT 1.0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX kg_edges_from_idx ON kg_edges(from_node_id);
CREATE INDEX kg_edges_to_idx   ON kg_edges(to_node_id);
```

### Modified tables

#### `chunks` — additions

```sql
ALTER TABLE chunks
  ADD COLUMN retrieval_count    integer     NOT NULL DEFAULT 0,
  ADD COLUMN last_retrieved_at  timestamptz,
  ADD COLUMN parent_chunk_id    uuid        REFERENCES chunks(id) ON DELETE SET NULL,
  ADD COLUMN is_promoted        boolean     NOT NULL DEFAULT false;

-- Stored tsvector for BM25 (performance fix — avoids recomputing on every query)
ALTER TABLE chunks ADD COLUMN content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX chunks_content_tsv_idx ON chunks USING GIN(content_tsv);
```

#### `documents` — additions

```sql
ALTER TABLE documents
  ADD COLUMN summary       text,
  ADD COLUMN tags          text[],
  ADD COLUMN doc_type      text,         -- contract|report|policy|invoice|manual|technical|legal|other
  ADD COLUMN distilled_at  timestamptz,  -- when distillation completed
  ADD COLUMN node_count    integer NOT NULL DEFAULT 0;  -- how many KG nodes extracted
```

### Full migration file

Location: `drizzle/0002_herald.sql`

---

## 6. Ingestion Pipeline Changes

### Modified flow

```
[EXISTING]                          [NEW]
──────────────────────────────      ──────────────────────────────────────
1. Download from R2                 
2. Extract text                     
3. Normalize                        
4. Chunk (sentence-aware)           
5. Embed (nomic-embed-text 768d)    
6. Upsert chunks                    
7. status = 'ready'                 → 8. Trigger distillation (background)
                                        distill_document(doc_id)
                                    → 9. status stays 'ready'
                                        documents.distilled_at = NOW()
                                        documents.node_count = N
```

### New file: `backend/distiller.py`

**Responsibilities:**
- Accept a list of chunks from a document
- Sample representative chunks (max 30 — cost control)
- Call `gpt-4o-mini` with structured output to extract concepts
- Deduplicate against existing `kg_nodes` for the same KB (title similarity)
- Embed node descriptions using the same Ollama nomic-embed-text model
- Batch-insert `kg_nodes` and `kg_edges`
- Update `documents.distilled_at` and `documents.node_count`

**Extraction prompt (exact):**

```python
EXTRACTION_SYSTEM = """
You are a knowledge extraction engine. Given a text passage, extract structured knowledge concepts.

For each distinct concept, fact, entity, definition, procedure, or requirement, output a JSON object with:
- "type": one of ["concept", "entity", "definition", "fact", "procedure", "requirement"]
- "title": short identifier, 2-6 words, title case
- "description": 1-3 sentences, self-contained explanation
- "tags": 3-7 relevant keyword strings
- "relationships": array of { "target_title": str, "relationship": str } for concepts this relates to

Rules:
- Only extract STABLE, REUSABLE knowledge — not query-specific details
- Each concept must be self-contained (understandable without the source passage)
- Maximum 8 concepts per passage
- Minimum confidence: only extract what is clearly and unambiguously stated
- Output: JSON object with key "concepts" containing the array

Example relationship types: defines, references, requires, part_of, extends, contradicts
"""
```

**Sampling strategy:**

```python
def select_representative_chunks(chunks: list[Chunk], max_sample: int = 30) -> list[Chunk]:
    """
    Sample chunks for distillation. Strategy:
    - Always include first and last chunk (doc structure)
    - Spread remaining sample evenly across document
    - Prefer longer chunks (more content per LLM call)
    """
    if len(chunks) <= max_sample:
        return chunks
    
    # Sort by token_count descending, take top max_sample
    # but ensure first + last are always included
    sorted_by_length = sorted(chunks, key=lambda c: c.token_count, reverse=True)
    selected = set([chunks[0].chunk_index, chunks[-1].chunk_index])
    for chunk in sorted_by_length:
        if len(selected) >= max_sample:
            break
        selected.add(chunk.chunk_index)
    
    return [c for c in chunks if c.chunk_index in selected]
```

**Deduplication strategy:**

Before inserting a new node, check if a node with a similar title already exists in the KB:
```sql
SELECT id, title FROM kg_nodes
WHERE kb_id = $kb_id
  AND similarity(lower(title), lower($new_title)) > 0.7
LIMIT 1
```
Requires `pg_trgm` extension (already available in Postgres). If a match exists, update the existing node's `description` and `chunk_ids` rather than inserting a duplicate.

### Modified file: `backend/ingestion.py`

Add one call after step 7 (status = ready):

```python
# Step 8: Trigger distillation (non-blocking background task)
asyncio.create_task(distill_document(doc_id, tenant_id, kb_id, chunks))
```

Do **not** `await` it — distillation failure must not affect document status.

### Modified file: `backend/main.py`

Add a new endpoint:

```
POST /distill/{document_id}
```

Allows manual re-distillation without full re-ingestion. Protected by `BACKEND_SECRET`.

---

## 7. Retrieval Pipeline Changes

### New file: `src/lib/search/kg.ts`

```typescript
export interface KGNode {
  id: string;
  type: string;
  title: string;
  description: string;
  tags: string[];
  documentId: string | null;
  score: number;
}

export async function kgSearch(
  tenantId: string,
  kbId: string,
  queryEmbedding: number[],
  query: string,
  topK = 10
): Promise<RetrievedChunk[]>
```

**Implementation notes:**
- Uses same cosine distance operator (`<=>`) as `vectorSearch`
- Also does keyword match on `title` and `tags` (simpler than full BM25)
- Converts `KGNode` to `RetrievedChunk` shape with `source: "kg"` added
- KG nodes get a base score boost of +0.15 in RRF (they are pre-validated)

### Modified file: `src/lib/search/retrieval.ts`

Update `bm25Search` to use stored `content_tsv` column:

```sql
-- Before (recomputes tsvector on every row):
WHERE to_tsvector('english', c.content) @@ plainto_tsquery(...)

-- After (uses pre-stored GIN-indexed column):
WHERE c.content_tsv @@ plainto_tsquery(...)

-- Also switch to websearch_to_tsquery for better multi-word handling:
WHERE c.content_tsv @@ websearch_to_tsquery('english', ${query})
```

### Modified file: `src/lib/search/rrf.ts`

Update `rrf()` to accept a `sourceBoosts` parameter:

```typescript
export function rrf(
  resultSets: RetrievedChunk[][],
  topK = 5,
  k = 60,
  sourceBoosts: Record<string, number> = { kg: 0.15, vector: 0, bm25: 0 }
): RetrievedChunk[]
```

KG nodes contribute their base RRF score plus the boost, ensuring they rank higher when relevance is comparable.

### Modified file: `src/app/api/chat/route.ts`

**Three changes:**

#### Change 1: HyDE query rewriting

Before calling `embedQuery`, generate a hypothetical answer:

```typescript
// HyDE: embed a hypothetical answer instead of the raw question
// Why: questions and answers live in different embedding spaces.
// A hypothetical answer is much closer to document text semantically.
const hydeCompletion = await chatClient.chat.completions.create({
  model: CHAT_MODEL,
  messages: [
    {
      role: "system",
      content: "Write a 2-3 sentence factual answer to this question as if you had the relevant documents. Be specific and use domain language. If unsure, write what a correct answer would look like."
    },
    { role: "user", content: message }
  ],
  max_tokens: 150,
  temperature: 0.1,
});
const hydeText = hydeCompletion.choices[0]?.message?.content ?? message;
const queryEmbedding = await embedQuery(hydeText);
// Use original `message` for BM25 — keyword search needs actual query terms
```

#### Change 2: Three-way parallel retrieval

```typescript
const [kgResults, vectorResults, bm25Results] = await Promise.allSettled([
  kgSearch(tenantId, kbId, queryEmbedding, message, topK * 2),
  vectorSearch(tenantId, kbId, queryEmbedding, topK * 4),
  bm25Search(tenantId, kbId, message, topK * 4),
]);

const mergedChunks = rrf(
  [
    kgResults.status === "fulfilled" ? kgResults.value : [],
    vectorResults.status === "fulfilled" ? vectorResults.value : [],
    bm25Results.status === "fulfilled" ? bm25Results.value : [],
  ],
  topK,
  60,
  { kg: 0.15, vector: 0, bm25: 0 }
);
```

#### Change 3: Async retrieval count increment

In `setImmediate` after streaming:

```typescript
// Increment retrieval counts on used chunks
await db.execute(sql`
  UPDATE chunks
  SET retrieval_count = retrieval_count + 1,
      last_retrieved_at = NOW()
  WHERE id = ANY(${mergedChunks.map(c => c.id)})
`);
```

---

## 8. Self-Improvement Loop

### Promoter background job

**New file: `backend/promoter.py`**

Runs on a schedule (every hour via APScheduler or a simple asyncio loop).

**Algorithm:**

```
1. SELECT chunks WHERE retrieval_count >= 3
                   AND is_promoted = false
                   AND tenant_id = <any>
   LIMIT 100 per run

2. For each chunk:
   a. Check if a kg_node already covers this chunk
      (chunk_id in kg_nodes.chunk_ids)
   b. If not, call distill_single_chunk(chunk)
   c. Insert new kg_node
   d. Update chunk: is_promoted = true

3. After promotion batch, update kg_nodes embeddings
   for any node whose description changed
```

**Promotion distillation is cheaper than full-doc distillation** — one chunk, one LLM call, ~200 tokens.

### Trigger points summary

| Event | Action |
|-------|--------|
| Document ingest complete | Full document distillation (sample 30 chunks) |
| Query answered (setImmediate) | Increment `retrieval_count` on used chunks |
| Hourly promoter job | Promote chunks with `retrieval_count >= 3` |
| Manual API call | `POST /distill/{doc_id}` — re-distill a document |
| Eval run (future) | High-scoring eval cases trigger node promotion |

---

## 9. Contradiction Detection

When a new document is ingested and distilled, compare its new nodes against existing `kg_nodes` in the same KB.

**New function in `distiller.py`:**

```python
async def detect_contradictions(
    new_nodes: list[KGNodeDraft],
    kb_id: str,
    tenant_id: str,
    session: AsyncSession
) -> None:
    """
    For each new node, check if existing KG nodes in the same KB
    have semantically similar titles but different/conflicting descriptions.
    Flag them for review rather than silently overwriting.
    """
```

**Detection logic:**

1. For each new node, find existing nodes with `similarity(title) > 0.7`
2. Ask `gpt-4o-mini`: "Do these two statements contradict each other? Answer YES or NO with one sentence reason."
3. If YES → set `kg_nodes.needs_review = true`, `review_reason = <reason>`
4. The new node is still inserted (don't suppress new info)
5. The UI surfaces `needs_review` nodes in the KB settings panel

This prevents the OKF "stale wiki" failure mode — the system knows when its knowledge might be outdated.

---

## 10. API Changes

### New endpoints

#### `GET /api/knowledge-bases/[id]/graph`

Returns the knowledge graph for a KB.

```typescript
// Response
{
  nodes: KGNode[],
  edges: KGEdge[],
  stats: {
    totalNodes: number,
    nodesByType: Record<string, number>,
    needsReview: number,
  }
}
```

#### `GET /api/knowledge-bases/[id]/graph/nodes`

Paginated list of KG nodes with filtering.

Query params: `type`, `tags`, `needsReview`, `page`, `limit`

#### `PATCH /api/knowledge-bases/[id]/graph/nodes/[nodeId]`

Allow users to edit a KG node's description, tags, or mark as reviewed.

```typescript
// Body
{
  description?: string,
  tags?: string[],
  needsReview?: false,  // dismiss review flag
}
```

#### `DELETE /api/knowledge-bases/[id]/graph/nodes/[nodeId]`

Delete a KG node. Tenant-scoped. Does not affect source chunks.

#### `POST /api/documents/[id]/distill`

Manually trigger re-distillation for a document (calls backend `/distill/{doc_id}`).

### Modified endpoints

#### `GET /api/documents?kbId=`

Add `nodeCount` and `distilledAt` fields to each document in the response.

#### `POST /api/chat`

Response SSE `meta` event gains two new fields:

```typescript
{
  type: "meta",
  conversationId: string,
  confidence: string,
  score: number,
  citations: Citation[],
  kgNodesUsed: number,      // NEW: how many KG nodes contributed to answer
  hydeUsed: boolean,        // NEW: whether HyDE was applied
}
```

---

## 11. Frontend Changes

### New page: `KG Explorer` (`/kb/[kbId]/graph`)

A read-only (with edit capability) view of the knowledge graph for a KB.

**Components needed:**
- `src/app/(dashboard)/kb/[kbId]/graph/page.tsx`
- `src/components/graph/KGNodeCard.tsx` — card showing node details
- `src/components/graph/KGNodeList.tsx` — filterable list view
- `src/components/graph/KGStats.tsx` — stats bar (total nodes, by type, needs_review count)
- `src/components/graph/ReviewAlert.tsx` — banner when nodes need review

**Layout:** Start with a list view (cards filtered by type). A force-directed graph visualization is optional and can be added later — it adds complexity without adding much utility at small KB sizes.

### Modified component: `StatusBadge`

Add two new statuses: `distilling` and `distilled` to the document status flow:

```
pending → processing → parsed → embedding → ready → distilling → distilled
```

The `distilling` state shows while `distiller.py` is running. `distilled` replaces `ready` once distillation completes. The current `ready` status is still valid (distillation is optional/async, doesn't block the document being usable).

### Modified component: `ChatWindow` / `MessageBubble`

When a message cites KG nodes (`kgNodesUsed > 0`), show a subtle badge:
```
[✦ Knowledge Graph]  — shown next to confidence label
```

This communicates the system's growing intelligence to the user without overwhelming them.

### Modified page: `KB Detail` (`/kb/[kbId]`)

Add a "Knowledge Graph" tab alongside "Documents" that links to `/kb/[kbId]/graph`.

Add KG stats to the KB header card:
- `N knowledge nodes`
- `N nodes need review` (if > 0, shown as warning)

---

## 12. Implementation Plan

Each step is independently deployable. Steps 1-4 form the MVP. Steps 5-7 add the self-improvement loop.

### Step 1 — Database migration ✅ START HERE

**File:** `drizzle/0002_herald.sql`

Tasks:
- [ ] Add `kg_nodes` table
- [ ] Add `kg_edges` table
- [ ] Add `retrieval_count`, `last_retrieved_at`, `parent_chunk_id`, `is_promoted` to `chunks`
- [ ] Add stored `content_tsv` generated column + GIN index to `chunks`
- [ ] Add `summary`, `tags`, `doc_type`, `distilled_at`, `node_count` to `documents`
- [ ] Add `pg_trgm` extension (for title similarity dedup)
- [ ] Update Drizzle schema (`src/lib/db/schema.ts`)
- [ ] Run migration on dev DB
- [ ] Verify all existing tests still pass

**Estimated time:** 2-3 hours  
**Risk:** Low — additive only, no existing columns changed

---

### Step 2 — KG search function

**File:** `src/lib/search/kg.ts` (new)

Tasks:
- [ ] Implement `kgSearch()` — cosine search on `kg_nodes.embedding`
- [ ] Implement `nodeToChunk()` — converts KGNode to RetrievedChunk shape
- [ ] Update `rrf()` to accept `sourceBoosts` parameter
- [ ] Unit tests for `kgSearch` with mock data

**Estimated time:** 2-3 hours  
**Risk:** Low — new function, no existing code modified

---

### Step 3 — Modified chat route (HyDE + 3-way retrieval)

**File:** `src/app/api/chat/route.ts`

Tasks:
- [ ] Add HyDE query rewriting (1 extra LLM call, ~150 tokens, before retrieval)
- [ ] Add `kgSearch` call in parallel with existing vector + BM25
- [ ] Update `rrf()` call to include KG results with boost
- [ ] Add async `retrieval_count` increment in `setImmediate`
- [ ] Add `kgNodesUsed` and `hydeUsed` to meta SSE event
- [ ] Fix BM25 to use stored `content_tsv` and `websearch_to_tsquery`

**Estimated time:** 3-4 hours  
**Risk:** Medium — modifies the critical chat path; test thoroughly

---

### Step 4 — Distillation engine

**File:** `backend/distiller.py` (new)

Tasks:
- [ ] `distill_document()` — main entry point, takes doc_id + chunks
- [ ] `select_representative_chunks()` — sampling strategy
- [ ] `extract_concepts_from_chunk()` — single LLM call, structured output
- [ ] `deduplicate_nodes()` — pg_trgm similarity check before insert
- [ ] `embed_nodes()` — embed node descriptions via Ollama
- [ ] `insert_nodes_and_edges()` — batch insert with conflict handling
- [ ] `detect_contradictions()` — compare new nodes vs existing
- [ ] Update `ingestion.py` to call `distill_document()` after status=ready
- [ ] Add `POST /distill/{doc_id}` endpoint to `main.py`
- [ ] Add `distilling` status handling to frontend `StatusBadge`

**Estimated time:** 6-8 hours  
**Risk:** Medium — new subsystem; distillation failure must not affect document availability

---

### Step 5 — Promoter background job

**File:** `backend/promoter.py` (new)

Tasks:
- [ ] `run_promotion_cycle()` — finds hot chunks, promotes to KG nodes
- [ ] `distill_single_chunk()` — single-chunk distillation (cheaper than full doc)
- [ ] APScheduler integration in `main.py` (hourly schedule)
- [ ] Logging: log promotion counts per run

**Estimated time:** 3-4 hours  
**Risk:** Low — background job, no user-facing path

---

### Step 6 — KG Explorer UI

**Files:** `src/app/(dashboard)/kb/[kbId]/graph/` (new directory)

Tasks:
- [ ] `GET /api/knowledge-bases/[id]/graph` route
- [ ] `PATCH /api/knowledge-bases/[id]/graph/nodes/[nodeId]` route
- [ ] `DELETE /api/knowledge-bases/[id]/graph/nodes/[nodeId]` route
- [ ] `KGNodeCard` component
- [ ] `KGNodeList` component with type/tag filters
- [ ] `KGStats` component
- [ ] `ReviewAlert` component
- [ ] Integrate into KB detail page as new tab

**Estimated time:** 5-6 hours  
**Risk:** Low — read-mostly UI, no pipeline changes

---

### Step 7 — Document metadata extraction

**Part of `distiller.py`**

Tasks:
- [ ] Extract `summary` (3-5 sentences) during distillation
- [ ] Classify `doc_type` (contract, report, policy, etc.)
- [ ] Extract top-level `tags` for the document
- [ ] Update `documents` table after distillation
- [ ] Show summary and tags in document list UI

**Estimated time:** 2-3 hours  
**Risk:** Low — additive to existing distillation call

---

## 13. File Map

```
docmind/
├── drizzle/
│   ├── 0001_initial.sql          (existing)
│   └── 0002_herald.sql           ← NEW (Step 1)
│
├── backend/
│   ├── ingestion.py              ← MODIFIED (Step 4 — add distillation trigger)
│   ├── main.py                   ← MODIFIED (Step 4 — add /distill endpoint, Step 5 — APScheduler)
│   ├── distiller.py              ← NEW (Step 4)
│   ├── promoter.py               ← NEW (Step 5)
│   ├── chunker.py                (existing — unchanged)
│   ├── extractor.py              (existing — unchanged)
│   ├── embedder.py               (existing — unchanged)
│   └── config.py                 ← MODIFIED (add herald config keys)
│
├── src/
│   ├── lib/
│   │   ├── db/
│   │   │   └── schema.ts         ← MODIFIED (Step 1 — new tables + columns)
│   │   └── search/
│   │       ├── retrieval.ts      ← MODIFIED (Step 3 — stored tsvector BM25)
│   │       ├── rrf.ts            ← MODIFIED (Step 2 — sourceBoosts param)
│   │       └── kg.ts             ← NEW (Step 2)
│   │
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/route.ts     ← MODIFIED (Step 3 — HyDE + 3-way retrieval)
│   │   │   ├── documents/
│   │   │   │   └── [id]/
│   │   │   │       └── distill/route.ts  ← NEW (Step 4)
│   │   │   └── knowledge-bases/
│   │   │       └── [id]/
│   │   │           └── graph/
│   │   │               ├── route.ts      ← NEW (Step 6)
│   │   │               └── nodes/
│   │   │                   └── [nodeId]/route.ts  ← NEW (Step 6)
│   │   │
│   │   └── (dashboard)/
│   │       └── kb/
│   │           └── [kbId]/
│   │               └── graph/
│   │                   └── page.tsx      ← NEW (Step 6)
│   │
│   └── components/
│       ├── documents/
│       │   └── StatusBadge.tsx   ← MODIFIED (Step 4 — distilling/distilled states)
│       └── graph/
│           ├── KGNodeCard.tsx    ← NEW (Step 6)
│           ├── KGNodeList.tsx    ← NEW (Step 6)
│           ├── KGStats.tsx       ← NEW (Step 6)
│           └── ReviewAlert.tsx   ← NEW (Step 6)
```

---

## 14. Configuration Reference

### New config keys in `backend/config.py`

```python
# HERALD — Distillation settings
herald_enabled: bool = Field(True, alias="HERALD_ENABLED")
herald_distill_max_chunks: int = Field(30, alias="HERALD_DISTILL_MAX_CHUNKS")
herald_promotion_threshold: int = Field(3, alias="HERALD_PROMOTION_THRESHOLD")
herald_dedup_similarity: float = Field(0.7, alias="HERALD_DEDUP_SIMILARITY")
herald_contradiction_check: bool = Field(True, alias="HERALD_CONTRADICTION_CHECK")
herald_promoter_interval_minutes: int = Field(60, alias="HERALD_PROMOTER_INTERVAL")

# LLM for distillation (can differ from chat model)
herald_distill_model: str = Field("gpt-4o-mini", alias="HERALD_DISTILL_MODEL")
```

### New env vars in `.env.example`

```bash
# HERALD — Knowledge Graph settings
HERALD_ENABLED=true
HERALD_DISTILL_MAX_CHUNKS=30
HERALD_PROMOTION_THRESHOLD=3
HERALD_DISTILL_MODEL=gpt-4o-mini
```

---

## 15. Testing Strategy

### Unit tests

| Test file | What it tests |
|-----------|---------------|
| `src/lib/search/__tests__/kg.test.ts` | `kgSearch` with mock DB rows |
| `src/lib/search/__tests__/rrf.test.ts` | Updated RRF with `sourceBoosts` (extend existing 17 tests) |
| `backend/tests/test_distiller.py` | `extract_concepts_from_chunk`, `deduplicate_nodes`, `select_representative_chunks` |
| `backend/tests/test_promoter.py` | `run_promotion_cycle` with mock DB state |

### Integration tests

| Scenario | Expected outcome |
|----------|-----------------|
| Ingest PDF → distillation runs → `kg_nodes` populated | `node_count > 0` on document |
| Query on fresh KB (no KG nodes) | Falls back to pure RAG, no errors |
| Query on KB with KG nodes | `kgNodesUsed > 0` in SSE meta event |
| Same chunk retrieved 3 times → promoter runs | Chunk `is_promoted = true`, new `kg_node` created |
| New doc with contradicting info ingested | Existing `kg_node.needs_review = true` |

### Regression tests

All 17 existing RRF unit tests must continue to pass after the `sourceBoosts` parameter addition (it has a default value, so existing call sites are unaffected).

---

## 16. Known Constraints and Ceilings

```
ponytail: distillation uses gpt-4o-mini synchronously in ingestion background task.
At high document volume (>100 docs/hour), this may bottleneck. Ceiling: add a
Redis queue (Bull/BullMQ) for distillation jobs separate from ingestion.

ponytail: KG node deduplication uses pg_trgm similarity at threshold 0.7.
This is a heuristic — it will miss semantic duplicates with different wording
(e.g. "Net Revenue" vs "Revenue Net of Returns"). Upgrade path: embed-based
dedup comparing node description vectors (cosine > 0.92 = duplicate).

ponytail: HNSW index on kg_nodes.embedding is created as a comment in the
migration (requires data to exist first). Run manually after first batch of
nodes is distilled: CREATE INDEX CONCURRENTLY ...

ponytail: The HyDE step adds ~150 tokens and ~200ms latency to every chat
query. If P95 latency becomes a concern, add a fast-path that skips HyDE
for short queries (<5 words) where the question IS the keyword.

ponytail: Contradiction detection calls gpt-4o-mini per (new_node, existing_node)
pair. Worst case O(n*m) calls. Ceiling: limit to top-5 similarity matches per
new node and batch them into one prompt.
```

---

*This document is the single source of truth for the HERALD implementation. All implementation decisions should reference this spec. Update this file when design decisions change.*
