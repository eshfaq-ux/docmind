"""
HERALD Promoter — self-improvement background job.

Watches chunks.retrieval_count and promotes "hot" chunks (retrieved
frequently across conversations) into first-class KG nodes.

This is the feedback loop that makes HERALD self-improving:
  1. User asks a question
  2. Chat route retrieves relevant chunks, increments their retrieval_count
  3. Promoter (hourly) finds chunks with count >= threshold
  4. Distills those chunks into KG nodes (Hot Layer)
  5. Next query for the same concept hits the KG directly — faster + structured

Why promotion threshold = 3 (default):
  - 1 retrieval could be a one-off query; not worth the LLM cost
  - 2 retrievals shows a pattern but may still be coincidental
  - 3+ retrievals across different conversations = genuinely recurring concept
  - Adjustable via HERALD_PROMOTION_THRESHOLD env var

Design decisions:
  - Processes max 100 chunks per cycle to bound LLM cost per run
  - Uses distill_single_chunk() from distiller.py — one LLM call per chunk
  - Marks chunks as is_promoted=true to avoid re-processing
  - All errors are caught per-chunk — one bad chunk never kills the cycle
"""
from __future__ import annotations

import logging

from sqlalchemy import text

from config import settings
from database import AsyncSessionLocal
from distiller import distill_single_chunk

logger = logging.getLogger(__name__)

# Max chunks to promote per cycle — bounds LLM cost per hourly run
_BATCH_LIMIT = 100


async def run_promotion_cycle() -> int:
    """
    Find hot chunks and promote them to KG nodes.
    Returns the number of chunks promoted in this cycle.
    """
    if not settings.herald_enabled:
        return 0

    promoted_count = 0

    async with AsyncSessionLocal() as session:
        # Fetch hot chunks: retrieved >= threshold, not yet promoted, have a document
        rows = await session.execute(
            text(
                """
                SELECT
                    c.id          AS chunk_id,
                    c.content,
                    c.document_id,
                    d.tenant_id,
                    d.kb_id
                FROM chunks c
                JOIN documents d ON d.id = c.document_id
                WHERE c.retrieval_count >= :threshold
                  AND c.is_promoted = FALSE
                  AND d.status IN ('ready', 'distilled')
                ORDER BY c.retrieval_count DESC
                LIMIT :limit
                """
            ),
            {
                "threshold": settings.herald_promotion_threshold,
                "limit": _BATCH_LIMIT,
            },
        )
        hot_chunks = rows.mappings().fetchall()

    if not hot_chunks:
        return 0

    logger.info("promoter: found %d hot chunks to promote", len(hot_chunks))

    for row in hot_chunks:
        chunk_id   = str(row["chunk_id"])
        doc_id     = str(row["document_id"])
        tenant_id  = str(row["tenant_id"])
        kb_id      = str(row["kb_id"])
        content    = str(row["content"])

        try:
            nodes_created = await distill_single_chunk(
                chunk_content=content,
                chunk_id=chunk_id,
                doc_id=doc_id,
                tenant_id=tenant_id,
                kb_id=kb_id,
            )

            # Mark chunk as promoted regardless of how many nodes were created
            # (0 nodes = content wasn't worth distilling = still mark promoted
            # to prevent re-processing the same chunk next cycle)
            async with AsyncSessionLocal() as session:
                await session.execute(
                    text(
                        """
                        UPDATE chunks
                        SET is_promoted = TRUE
                        WHERE id = :chunk_id
                        """
                    ),
                    {"chunk_id": chunk_id},
                )
                await session.commit()

            promoted_count += 1

            if nodes_created > 0:
                logger.debug(
                    "promoter: promoted chunk=%s → %d new nodes",
                    chunk_id, nodes_created,
                )

        except Exception:
            logger.exception("promoter: failed to promote chunk=%s", chunk_id)
            # Continue with next chunk — one failure doesn't stop the cycle

    logger.info("promoter: cycle complete, promoted=%d", promoted_count)
    return promoted_count
