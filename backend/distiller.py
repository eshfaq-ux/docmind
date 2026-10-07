"""
HERALD Distillation Engine.

Converts raw document chunks into structured OKF-style knowledge nodes (kg_nodes)
that form the Hot Layer of the HERALD architecture.

Flow per document:
  1. Sample representative chunks (max HERALD_DISTILL_MAX_CHUNKS)
  2. For each chunk, extract concepts via LLM (OpenRouter/auto or OpenAI fallback)
  3. Deduplicate new nodes against existing kg_nodes in the same KB (pg_trgm similarity)
  4. Embed node descriptions via Ollama (same model as chunks: nomic-embed-text 768d)
  5. Batch-insert kg_nodes and kg_edges
  6. Run contradiction detection against existing nodes
  7. Extract document-level summary, tags, doc_type
  8. Update documents.distilled_at, documents.node_count, documents.summary etc.

Design decisions:
- Uses OpenRouter/auto (free) if configured, OpenAI gpt-4o-mini as fallback.
  Distillation failure must NOT affect document availability — all errors are caught
  and logged; the document remains in 'ready' status.
- Deduplication uses pg_trgm similarity on lowercased titles (threshold 0.7).
  Semantic deduplication (embed-based) is noted as an upgrade path in HERALD.md.
- Contradiction detection is O(new_nodes * top_5_similar) — bounded per document.
- Embedding uses the same Ollama nomic-embed-text model as chunk embeddings so
  KG nodes are searchable in the same vector space.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx
from openai import AsyncOpenAI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from chunker import Chunk
from config import settings
from database import AsyncSessionLocal

logger = logging.getLogger(__name__)

# ── LLM client (OpenRouter preferred, OpenAI fallback) ────────────────────────

def _make_llm_client() -> AsyncOpenAI:
    kwargs: dict[str, Any] = {"api_key": settings.llm_api_key}
    if settings.llm_base_url:
        kwargs["base_url"] = settings.llm_base_url
        kwargs["default_headers"] = {
            "HTTP-Referer": "https://docmind.app",
            "X-Title": "DocMind HERALD",
        }
    return AsyncOpenAI(**kwargs)

_llm = _make_llm_client()

# ── Ollama embedding URL (same as embedder.py) ────────────────────────────────
_OLLAMA_URL = "http://localhost:11434/api/embeddings"

# ── Prompts ───────────────────────────────────────────────────────────────────

_EXTRACT_SYSTEM = """You are a knowledge extraction engine. Given a text passage, extract structured knowledge concepts.

For each distinct concept, fact, entity, definition, procedure, or requirement, output a JSON object.

Output format — a JSON object with key "concepts" containing an array. Each concept:
{
  "type": one of ["concept", "entity", "definition", "fact", "procedure", "requirement"],
  "title": "Short identifier, 2-6 words, Title Case",
  "description": "1-3 sentences, self-contained, understandable without the source passage.",
  "tags": ["tag1", "tag2", "tag3"],
  "relationships": [
    {"target_title": "Related Concept Title", "relationship": "defines|references|requires|part_of|extends|contradicts"}
  ]
}

Rules:
- Only extract STABLE, REUSABLE knowledge — not query-specific or one-off details
- Each concept must be self-contained (understandable without the source text)
- Maximum 8 concepts per passage
- Only extract what is clearly and unambiguously stated in the passage
- Tags: 3-7 lowercase keyword strings
- Relationships: only add if the relationship is explicitly clear from the text
- If nothing worth extracting, return {"concepts": []}"""

_DOC_META_SYSTEM = """You are a document classifier. Given a document summary, return a JSON object with:
{
  "summary": "3-5 sentence summary of the document's purpose and main content",
  "doc_type": one of ["contract", "report", "policy", "invoice", "manual", "technical", "legal", "other"],
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}
Be concise. Tags should be 3-7 lowercase keywords describing the document domain."""

_CONTRADICT_SYSTEM = """You are a fact-checking assistant. Given two statements, determine if they contradict each other.

Reply with a JSON object:
{"contradicts": true/false, "reason": "one sentence explanation"}

Two statements contradict if they make incompatible factual claims about the same subject.
Complementary information, different perspectives, or updates do NOT constitute contradictions."""


# ── Data structures ───────────────────────────────────────────────────────────

@dataclass
class KGNodeDraft:
    type: str
    title: str
    description: str
    tags: list[str] = field(default_factory=list)
    relationships: list[dict] = field(default_factory=list)
    chunk_id: str = ""
    embedding: list[float] = field(default_factory=list)


# ── Public entry point ────────────────────────────────────────────────────────

async def distill_document(
    doc_id: str,
    tenant_id: str,
    kb_id: str,
    chunks: list[Chunk],
) -> None:
    """
    Full distillation pipeline for one document.
    All errors are caught — distillation failure never affects document status.
    """
    if not settings.herald_enabled:
        return

    if not chunks:
        logger.warning("distill: no chunks for doc=%s, skipping", doc_id)
        return

    try:
        await _run_distillation(doc_id, tenant_id, kb_id, chunks)
    except Exception:
        logger.exception("distill: unhandled error for doc=%s", doc_id)
        # Do NOT set document status to failed — document is still usable via RAG


async def _run_distillation(
    doc_id: str,
    tenant_id: str,
    kb_id: str,
    chunks: list[Chunk],
) -> None:
    logger.info("distill: starting doc=%s chunks=%d", doc_id, len(chunks))

    async with AsyncSessionLocal() as session:
        # Mark document as distilling
        await session.execute(
            text("UPDATE documents SET status = 'distilling' WHERE id = :id"),
            {"id": doc_id},
        )
        await session.commit()

    # ── Step 1: Sample representative chunks ──────────────────────────────────
    sample = _select_representative_chunks(chunks, settings.herald_distill_max_chunks)
    logger.info("distill: sampled %d/%d chunks", len(sample), len(chunks))

    # ── Step 2: Extract concepts from each chunk ──────────────────────────────
    all_drafts: list[KGNodeDraft] = []
    for chunk in sample:
        drafts = await _extract_concepts(chunk)
        all_drafts.extend(drafts)

    logger.info("distill: extracted %d raw concepts", len(all_drafts))

    if not all_drafts:
        await _finalize_document(doc_id, 0, "", [], "other")
        return

    # ── Step 3: Deduplicate against existing KB nodes ─────────────────────────
    async with AsyncSessionLocal() as session:
        unique_drafts = await _deduplicate_drafts(all_drafts, kb_id, tenant_id, session)

    logger.info("distill: %d unique concepts after dedup", len(unique_drafts))

    if not unique_drafts:
        await _finalize_document(doc_id, 0, "", [], "other")
        return

    # ── Step 4: Embed node descriptions ──────────────────────────────────────
    unique_drafts = await _embed_drafts(unique_drafts)

    # ── Step 5: Insert nodes and edges ───────────────────────────────────────
    async with AsyncSessionLocal() as session:
        node_ids = await _insert_nodes(unique_drafts, doc_id, tenant_id, kb_id, session)
        await _insert_edges(unique_drafts, node_ids, tenant_id, kb_id, session)

    logger.info("distill: inserted %d nodes", len(node_ids))

    # ── Step 6: Contradiction detection ──────────────────────────────────────
    if settings.herald_contradiction_check and unique_drafts:
        async with AsyncSessionLocal() as session:
            await _detect_contradictions(unique_drafts, kb_id, tenant_id, session)

    # ── Step 7: Document-level metadata ──────────────────────────────────────
    # Use first chunk as representative sample for summary/classification
    sample_text = " ".join(c.content[:500] for c in sample[:5])
    summary, tags, doc_type = await _extract_doc_metadata(sample_text)

    # ── Step 8: Finalize document ─────────────────────────────────────────────
    await _finalize_document(doc_id, len(node_ids), summary, tags, doc_type)
    logger.info("distill: completed doc=%s nodes=%d", doc_id, len(node_ids))


# ── Chunk sampling ─────────────────────────────────────────────────────────────

def _select_representative_chunks(
    chunks: list[Chunk],
    max_sample: int,
) -> list[Chunk]:
    """
    Sample chunks for distillation.
    Strategy: always include first + last, then fill remaining quota
    with longest chunks (most content per LLM call).
    """
    if len(chunks) <= max_sample:
        return chunks

    # Always include first and last
    must_include = {chunks[0].chunk_index, chunks[-1].chunk_index}

    # Fill remaining with longest chunks
    by_length = sorted(chunks, key=lambda c: c.token_count, reverse=True)
    selected_indices = set(must_include)
    for c in by_length:
        if len(selected_indices) >= max_sample:
            break
        selected_indices.add(c.chunk_index)

    return [c for c in chunks if c.chunk_index in selected_indices]


# ── Concept extraction ────────────────────────────────────────────────────────

async def _extract_concepts(chunk: Chunk) -> list[KGNodeDraft]:
    """Call LLM to extract structured concepts from a single chunk."""
    try:
        res = await _llm.chat.completions.create(
            model=settings.llm_model,
            messages=[
                {"role": "system", "content": _EXTRACT_SYSTEM},
                {"role": "user", "content": chunk.content},
            ],
            temperature=0,
            max_tokens=1200,
            response_format={"type": "json_object"},
        )
        raw = res.choices[0].message.content or "{}"
        data = json.loads(raw)
        concepts = data.get("concepts", [])

        drafts = []
        for c in concepts[:8]:  # hard cap per chunk
            if not c.get("title") or not c.get("description"):
                continue
            drafts.append(KGNodeDraft(
                type=c.get("type", "concept"),
                title=str(c["title"])[:200],
                description=str(c["description"])[:1000],
                tags=[str(t)[:50] for t in c.get("tags", [])[:7]],
                relationships=c.get("relationships", [])[:10],
                chunk_id=str(chunk.chunk_index),  # temporary — replaced with real UUID at insert
            ))
        return drafts
    except Exception:
        logger.exception("distill: concept extraction failed for chunk %s", chunk.chunk_index)
        return []


# ── Deduplication ─────────────────────────────────────────────────────────────

async def _deduplicate_drafts(
    drafts: list[KGNodeDraft],
    kb_id: str,
    tenant_id: str,
    session: AsyncSession,
) -> list[KGNodeDraft]:
    """
    Remove drafts whose titles are too similar to existing kg_nodes in the KB.
    Uses pg_trgm similarity() function (requires pg_trgm extension — added in 0002 migration).
    Threshold: settings.herald_dedup_similarity (default 0.7).
    """
    unique: list[KGNodeDraft] = []
    seen_titles: set[str] = set()

    for draft in drafts:
        lower_title = draft.title.lower()

        # Check within this batch first (cheap)
        if lower_title in seen_titles:
            continue

        # Check against existing DB nodes
        row = await session.execute(
            text(
                """
                SELECT id FROM kg_nodes
                WHERE kb_id = :kb_id
                  AND tenant_id = :tenant_id
                  AND similarity(lower(title), lower(:title)) > :threshold
                LIMIT 1
                """
            ),
            {
                "kb_id": kb_id,
                "tenant_id": tenant_id,
                "title": draft.title,
                "threshold": settings.herald_dedup_similarity,
            },
        )
        if row.fetchone() is not None:
            # Node with similar title already exists — skip
            continue

        seen_titles.add(lower_title)
        unique.append(draft)

    return unique


# ── Embedding ─────────────────────────────────────────────────────────────────

async def _embed_drafts(drafts: list[KGNodeDraft]) -> list[KGNodeDraft]:
    """Embed node descriptions using Ollama nomic-embed-text (same model as chunks)."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        for draft in drafts:
            try:
                res = await client.post(
                    _OLLAMA_URL,
                    json={"model": settings.embed_model, "prompt": draft.description},
                )
                res.raise_for_status()
                draft.embedding = res.json()["embedding"]
            except Exception:
                logger.warning("distill: embedding failed for node '%s'", draft.title)
                # Node without embedding is still inserted — just not vector-searchable
    return drafts


# ── Insert nodes ──────────────────────────────────────────────────────────────

async def _insert_nodes(
    drafts: list[KGNodeDraft],
    doc_id: str,
    tenant_id: str,
    kb_id: str,
    session: AsyncSession,
) -> dict[str, str]:
    """
    Batch-insert kg_nodes. Returns mapping of draft title → inserted node UUID.
    """
    title_to_id: dict[str, str] = {}

    for draft in drafts:
        node_id = str(uuid.uuid4())
        embedding_str = (
            f"[{','.join(map(str, draft.embedding))}]"
            if draft.embedding else None
        )

        await session.execute(
            text(
                """
                INSERT INTO kg_nodes
                  (id, tenant_id, kb_id, document_id, chunk_ids, type, title,
                   description, tags, relationships, embedding, confidence, auto_generated)
                VALUES
                  (:id, :tenant_id, :kb_id, :doc_id, :chunk_ids, :type, :title,
                   :description, :tags, :relationships::jsonb,
                   CASE WHEN :embedding IS NULL THEN NULL
                        ELSE CAST(:embedding AS vector) END,
                   0.85, TRUE)
                ON CONFLICT DO NOTHING
                """
            ),
            {
                "id": node_id,
                "tenant_id": tenant_id,
                "kb_id": kb_id,
                "doc_id": doc_id,
                "chunk_ids": "{}",  # will be populated by promoter when chunks are promoted
                "type": draft.type,
                "title": draft.title,
                "description": draft.description,
                "tags": "{" + ",".join(f'"{t}"' for t in draft.tags) + "}",
                "relationships": json.dumps(draft.relationships),
                "embedding": embedding_str,
            },
        )
        title_to_id[draft.title] = node_id

    await session.commit()
    return title_to_id


# ── Insert edges ──────────────────────────────────────────────────────────────

async def _insert_edges(
    drafts: list[KGNodeDraft],
    title_to_id: dict[str, str],
    tenant_id: str,
    kb_id: str,
    session: AsyncSession,
) -> None:
    """
    Insert kg_edges for relationships between nodes inserted in this batch.
    Only creates edges where both source and target are in this batch
    (cross-document edges are built by the promoter when nodes accumulate).
    """
    for draft in drafts:
        from_id = title_to_id.get(draft.title)
        if not from_id:
            continue

        for rel in draft.relationships:
            target_title = rel.get("target_title", "")
            relationship = rel.get("relationship", "references")
            to_id = title_to_id.get(target_title)
            if not to_id or to_id == from_id:
                continue

            try:
                await session.execute(
                    text(
                        """
                        INSERT INTO kg_edges
                          (id, tenant_id, kb_id, from_node_id, to_node_id, relationship)
                        VALUES
                          (:id, :tenant_id, :kb_id, :from_id, :to_id, :rel)
                        ON CONFLICT ON CONSTRAINT kg_edges_unique DO NOTHING
                        """
                    ),
                    {
                        "id": str(uuid.uuid4()),
                        "tenant_id": tenant_id,
                        "kb_id": kb_id,
                        "from_id": from_id,
                        "to_id": to_id,
                        "rel": relationship,
                    },
                )
            except Exception:
                logger.warning(
                    "distill: failed to insert edge %s -[%s]-> %s",
                    draft.title, relationship, target_title,
                )

    await session.commit()


# ── Contradiction detection ───────────────────────────────────────────────────

async def _detect_contradictions(
    new_drafts: list[KGNodeDraft],
    kb_id: str,
    tenant_id: str,
    session: AsyncSession,
) -> None:
    """
    For each new node, find the top-5 most title-similar existing nodes and ask
    the LLM if they contradict. Flags contradicting nodes with needs_review=true.

    Bounded: max 5 similarity checks per new node, max 1 LLM call per check.
    Total LLM calls per document: at most len(new_drafts) * 5 (usually far fewer —
    most new nodes have no similar existing nodes).
    """
    for draft in new_drafts:
        rows = await session.execute(
            text(
                """
                SELECT id, title, description
                FROM kg_nodes
                WHERE kb_id = :kb_id
                  AND tenant_id = :tenant_id
                  AND similarity(lower(title), lower(:title)) > 0.5
                  AND title != :title
                ORDER BY similarity(lower(title), lower(:title)) DESC
                LIMIT 5
                """
            ),
            {"kb_id": kb_id, "tenant_id": tenant_id, "title": draft.title},
        )
        existing = rows.mappings().fetchall()

        for existing_node in existing:
            contradiction = await _check_contradiction(
                draft.description,
                str(existing_node["description"]),
            )
            if contradiction["contradicts"]:
                await session.execute(
                    text(
                        """
                        UPDATE kg_nodes
                        SET needs_review = TRUE,
                            review_reason = :reason,
                            updated_at = NOW()
                        WHERE id = :id
                        """
                    ),
                    {
                        "id": str(existing_node["id"]),
                        "reason": f"Potential contradiction with new document content: {contradiction['reason']}",
                    },
                )
                logger.info(
                    "distill: contradiction flagged on node %s — %s",
                    existing_node["id"], contradiction["reason"],
                )

    await session.commit()


async def _check_contradiction(stmt_a: str, stmt_b: str) -> dict:
    """Ask LLM if two statements contradict each other. Returns {contradicts, reason}."""
    try:
        res = await _llm.chat.completions.create(
            model=settings.llm_model,
            messages=[
                {"role": "system", "content": _CONTRADICT_SYSTEM},
                {
                    "role": "user",
                    "content": f"Statement A: {stmt_a[:500]}\n\nStatement B: {stmt_b[:500]}",
                },
            ],
            temperature=0,
            max_tokens=100,
            response_format={"type": "json_object"},
        )
        raw = res.choices[0].message.content or "{}"
        return json.loads(raw)
    except Exception:
        return {"contradicts": False, "reason": ""}


# ── Document metadata extraction ──────────────────────────────────────────────

async def _extract_doc_metadata(
    sample_text: str,
) -> tuple[str, list[str], str]:
    """Extract summary, tags, and doc_type from a sample of the document text."""
    try:
        res = await _llm.chat.completions.create(
            model=settings.llm_model,
            messages=[
                {"role": "system", "content": _DOC_META_SYSTEM},
                {"role": "user", "content": sample_text[:3000]},
            ],
            temperature=0,
            max_tokens=300,
            response_format={"type": "json_object"},
        )
        raw = res.choices[0].message.content or "{}"
        data = json.loads(raw)
        summary = str(data.get("summary", ""))[:1000]
        tags = [str(t)[:50] for t in data.get("tags", [])[:7]]
        doc_type = str(data.get("doc_type", "other"))
        return summary, tags, doc_type
    except Exception:
        logger.warning("distill: doc metadata extraction failed")
        return "", [], "other"


# ── Finalize document ─────────────────────────────────────────────────────────

async def _finalize_document(
    doc_id: str,
    node_count: int,
    summary: str,
    tags: list[str],
    doc_type: str,
) -> None:
    """Update document record after distillation completes."""
    async with AsyncSessionLocal() as session:
        tags_pg = "{" + ",".join(f'"{t}"' for t in tags) + "}"
        await session.execute(
            text(
                """
                UPDATE documents
                SET status       = 'distilled',
                    distilled_at = NOW(),
                    node_count   = :node_count,
                    summary      = NULLIF(:summary, ''),
                    tags         = :tags,
                    doc_type     = NULLIF(:doc_type, 'other')
                WHERE id = :id
                """
            ),
            {
                "id": doc_id,
                "node_count": node_count,
                "summary": summary,
                "tags": tags_pg,
                "doc_type": doc_type,
            },
        )
        await session.commit()


# ── Single-chunk distillation (used by Promoter) ──────────────────────────────

async def distill_single_chunk(
    chunk_content: str,
    chunk_id: str,
    doc_id: str,
    tenant_id: str,
    kb_id: str,
) -> int:
    """
    Distill a single chunk into KG nodes. Used by the Promoter job when a chunk
    reaches the retrieval_count threshold. Returns number of nodes inserted.
    """
    if not settings.herald_enabled:
        return 0

    # Create a minimal Chunk-like object for reuse
    @dataclass
    class _MinChunk:
        content: str
        chunk_index: int = 0
        token_count: int = 0
        page_number: int | None = None

    mock_chunk = _MinChunk(content=chunk_content)
    drafts = await _extract_concepts(mock_chunk)  # type: ignore[arg-type]
    if not drafts:
        return 0

    async with AsyncSessionLocal() as session:
        unique = await _deduplicate_drafts(drafts, kb_id, tenant_id, session)

    if not unique:
        return 0

    unique = await _embed_drafts(unique)

    async with AsyncSessionLocal() as session:
        node_ids = await _insert_nodes(unique, doc_id, tenant_id, kb_id, session)
        await _insert_edges(unique, node_ids, tenant_id, kb_id, session)

        # Link chunk to its new nodes
        if node_ids and chunk_id:
            for nid in node_ids.values():
                await session.execute(
                    text(
                        """
                        UPDATE kg_nodes
                        SET chunk_ids = array_append(chunk_ids, :chunk_id::uuid)
                        WHERE id = :node_id
                          AND NOT (:chunk_id::uuid = ANY(chunk_ids))
                        """
                    ),
                    {"chunk_id": chunk_id, "node_id": nid},
                )
            await session.commit()

    return len(node_ids)
