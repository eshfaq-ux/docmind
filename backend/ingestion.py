"""
Document ingestion pipeline.

End-to-end flow:
  1. Fetch document row + metadata from Postgres
  2. Download file bytes from Cloudflare R2 via presigned GET URL
  3. Extract text (PDF / DOCX / TXT)
  4. Chunk into token-bounded, sentence-aware segments
  5. Embed all chunks (batched, with retry)
  6. Upsert chunks + embeddings into Postgres (pgvector)
  7. Update document status, counters, indexed_at
  8. Decrement / increment KB chunk counters atomically

Status progression:
  pending → processing → parsed → embedding → ready
                                             ↓
                                           failed (on any unrecoverable error)

Idempotency:
  Re-ingesting an already-indexed document:
    - Caller deletes existing chunks before calling ingest_document
    - This function always starts fresh from status=pending
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import uuid
from datetime import datetime, timezone

import boto3
import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from chunker import chunk_pages
from config import settings
from database import AsyncSessionLocal
from embedder import embed_all, estimate_embed_cost
from extractor import extract

logger = logging.getLogger(__name__)


# ── Status helpers ─────────────────────────────────────────────────────────────

async def _set_status(
    session: AsyncSession,
    doc_id: str,
    status: str,
    error: str | None = None,
) -> None:
    await session.execute(
        text(
            """
            UPDATE documents
            SET status = :status,
                error_message = :error,
                indexed_at = CASE WHEN :status = 'ready' THEN NOW() ELSE indexed_at END
            WHERE id = :id
            """
        ),
        {"status": status, "error": error, "id": doc_id},
    )
    await session.commit()


# ── Main pipeline ──────────────────────────────────────────────────────────────

async def ingest_document(document_id: str) -> None:
    """
    Full ingestion pipeline for one document.
    All DB work uses a single session; errors set status=failed.
    """
    async with AsyncSessionLocal() as session:
        # ── 1. Fetch document row ──────────────────────────────────────────────
        row = await session.execute(
            text(
                """
                SELECT id, tenant_id, kb_id, name, source_type, r2_key,
                       chunk_size, chunk_overlap, chunk_count
                FROM documents
                WHERE id = :id
                """
            ),
            {"id": document_id},
        )
        doc = row.mappings().one_or_none()
        if doc is None:
            logger.error("ingest: document %s not found", document_id)
            return

        doc_id     = str(doc["id"])
        tenant_id  = str(doc["tenant_id"])
        kb_id      = str(doc["kb_id"])
        name       = doc["name"]
        source_type = doc["source_type"]
        r2_key     = doc["r2_key"]
        chunk_size = doc["chunk_size"] or settings.default_chunk_size
        chunk_overlap = doc["chunk_overlap"] or settings.default_chunk_overlap
        old_chunk_count = doc["chunk_count"] or 0

        await _set_status(session, doc_id, "processing")

        # ── 2. Download from R2 ────────────────────────────────────────────────
        try:
            file_bytes = await _download_r2(r2_key)
        except Exception as exc:
            logger.exception("ingest: R2 download failed for %s", doc_id)
            await _set_status(session, doc_id, "failed", str(exc))
            return

        # ── 3. Compute content hash (deduplication guard) ──────────────────────
        content_hash = hashlib.sha256(file_bytes).hexdigest()
        await session.execute(
            text("UPDATE documents SET content_hash = :h WHERE id = :id"),
            {"h": content_hash, "id": doc_id},
        )
        await session.commit()

        # ── 4. Extract text ────────────────────────────────────────────────────
        extraction = extract(file_bytes, source_type)
        if extraction.error:
            await _set_status(session, doc_id, "failed", extraction.error)
            return
        if not extraction.pages:
            await _set_status(session, doc_id, "failed", "No extractable text found in document")
            return

        await session.execute(
            text("UPDATE documents SET page_count = :n, status = 'parsed' WHERE id = :id"),
            {"n": extraction.page_count, "id": doc_id},
        )
        await session.commit()

        # ── 5. Chunk ───────────────────────────────────────────────────────────
        chunks = chunk_pages(extraction.pages, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        if not chunks:
            await _set_status(session, doc_id, "failed", "Chunking produced zero chunks")
            return

        await _set_status(session, doc_id, "embedding")

        # ── 6. Embed ───────────────────────────────────────────────────────────
        try:
            embeddings = await embed_all([c.content for c in chunks])
        except Exception as exc:
            logger.exception("ingest: embedding failed for %s", doc_id)
            await _set_status(session, doc_id, "failed", f"Embedding failed: {exc}")
            return

        total_tokens = sum(c.token_count for c in chunks)
        cost_usd = estimate_embed_cost(total_tokens)

        # ── 7. Insert chunks ───────────────────────────────────────────────────
        chunk_rows = [
            {
                "id": str(uuid.uuid4()),
                "document_id": doc_id,
                "tenant_id": tenant_id,
                "kb_id": kb_id,
                "content": chunks[i].content,
                "page_number": chunks[i].page_number,
                "chunk_index": chunks[i].chunk_index,
                "token_count": chunks[i].token_count,
                "embedding": f"[{','.join(map(str, embeddings[i]))}]",
            }
            for i in range(len(chunks))
        ]

        # Batch insert in groups of 100 to avoid very large params
        BATCH = 100
        for batch_start in range(0, len(chunk_rows), BATCH):
            batch = chunk_rows[batch_start : batch_start + BATCH]
            await session.execute(
                text(
                    """
                    INSERT INTO chunks
                      (id, document_id, tenant_id, kb_id, content,
                       page_number, chunk_index, token_count, embedding)
                    VALUES
                      (:id, :document_id, :tenant_id, :kb_id, :content,
                       :page_number, :chunk_index, :token_count, CAST(:embedding AS vector))
                    """
                ),
                batch,
            )
        await session.commit()

        # ── 8. Mark ready + update counters ───────────────────────────────────
        new_chunk_count = len(chunks)

        await session.execute(
            text(
                """
                UPDATE documents
                SET status      = 'ready',
                    chunk_count = :n,
                    indexed_at  = NOW(),
                    error_message = NULL
                WHERE id = :id
                """
            ),
            {"n": new_chunk_count, "id": doc_id},
        )

        # Atomic KB counter update (handles re-index: subtract old, add new)
        await session.execute(
            text(
                """
                UPDATE knowledge_bases
                SET chunk_count = chunk_count - :old + :new,
                    doc_count   = doc_count + CASE WHEN :old = 0 THEN 1 ELSE 0 END,
                    updated_at  = NOW()
                WHERE id = :kb_id
                """
            ),
            {"old": old_chunk_count, "new": new_chunk_count, "kb_id": kb_id},
        )

        # Record usage event for embedding cost
        await session.execute(
            text(
                """
                INSERT INTO usage_events
                  (tenant_id, event_type, model, prompt_tokens, completion_tokens,
                   total_tokens, cost_usd, kb_id, document_id)
                VALUES
                  (:tenant_id, 'embed', :model, :prompt_tokens, 0,
                   :total_tokens, :cost_usd, :kb_id, :doc_id)
                """
            ),
            {
                "tenant_id": tenant_id,
                "model": settings.embed_model,
                "prompt_tokens": total_tokens,
                "total_tokens": total_tokens,
                "cost_usd": str(cost_usd),
                "kb_id": kb_id,
                "doc_id": doc_id,
            },
        )

        await session.commit()
        logger.info(
            "ingest: completed doc=%s chunks=%d tokens=%d cost=$%.6f",
            doc_id, new_chunk_count, total_tokens, cost_usd,
        )

    # ── Step 9: Trigger HERALD distillation (non-blocking) ────────────────────
    # Runs as a fire-and-forget task — failure never affects document availability.
    # Document remains in 'ready' status from the pipeline above; distiller
    # transitions it to 'distilling' then 'distilled' independently.
    from distiller import distill_document as _distill  # local import avoids circular
    asyncio.create_task(_distill(doc_id, tenant_id, kb_id, chunks))


# ── R2 download ────────────────────────────────────────────────────────────────

async def _download_r2(r2_key: str) -> bytes:
    """
    Download a file from Cloudflare R2 using boto3 (S3-compatible).
    Uses synchronous boto3 in a thread executor to avoid blocking the
    asyncio event loop.
    """
    import asyncio

    def _sync_download() -> bytes:
        s3 = boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint,
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
            region_name=settings.r2_region,
            config=boto3.session.Config(signature_version="s3v4"),
        )
        obj = s3.get_object(Bucket=settings.r2_bucket_name, Key=r2_key)
        return obj["Body"].read()

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _sync_download)
