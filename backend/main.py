"""
FastAPI ingestion service.

Endpoints:
  POST /ingest/{document_id}   — trigger ingestion (called by Next.js)
  POST /distill/{document_id}  — manually trigger HERALD distillation
  GET  /status/{document_id}   — poll document status
  GET  /health                 — liveness probe

All endpoints require Authorization: Bearer <BACKEND_SECRET>.
"""
from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, HTTPException, Header, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text

from config import settings
from database import AsyncSessionLocal, engine
from ingestion import ingest_document
from distiller import distill_document
from promoter import run_promotion_cycle

# ── Structured logging ─────────────────────────────────────────────────────────
structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
)
log = structlog.get_logger()

# ── Semaphore: limit concurrent ingestions ─────────────────────────────────────
_ingest_sem = asyncio.Semaphore(settings.max_concurrent_ingestions)


# ── Promoter background loop ───────────────────────────────────────────────────

async def _promoter_loop() -> None:
    """
    Runs the HERALD promotion cycle on a fixed interval.
    Finds chunks with retrieval_count >= threshold and promotes them to KG nodes.
    Runs forever until the app shuts down — errors are caught and logged per cycle.
    """
    interval = settings.herald_promoter_interval_minutes * 60
    log.info("promoter.started", interval_minutes=settings.herald_promoter_interval_minutes)
    while True:
        await asyncio.sleep(interval)
        try:
            promoted = await run_promotion_cycle()
            if promoted > 0:
                log.info("promoter.cycle_complete", promoted=promoted)
        except Exception:
            log.exception("promoter.cycle_error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("backend.startup", max_concurrent=settings.max_concurrent_ingestions)
    # Start the HERALD promoter background loop
    if settings.herald_enabled:
        asyncio.create_task(_promoter_loop())
    yield
    await engine.dispose()
    log.info("backend.shutdown")


app = FastAPI(title="DocMind Ingestion Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)


# ── Auth helper ────────────────────────────────────────────────────────────────

def _require_auth(authorization: str | None) -> None:
    expected = f"Bearer {settings.backend_secret}"
    if not authorization or authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


# ── Request models ─────────────────────────────────────────────────────────────

class IngestRequest(BaseModel):
    tenant_id: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.post("/ingest/{document_id}", status_code=202)
async def trigger_ingest(
    document_id: str,
    body: IngestRequest,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
) -> dict:
    _require_auth(authorization)

    async def _run():
        async with _ingest_sem:
            try:
                await ingest_document(document_id)
            except Exception:
                log.exception("ingest.unhandled_error", document_id=document_id)

    background_tasks.add_task(_run)
    log.info("ingest.queued", document_id=document_id)
    return {"status": "queued", "document_id": document_id}


@app.post("/distill/{document_id}", status_code=202)
async def trigger_distill(
    document_id: str,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
) -> dict:
    """
    Manually trigger HERALD distillation for an already-ingested document.
    Document must be in 'ready' or 'distilled' status.
    """
    _require_auth(authorization)

    if not settings.herald_enabled:
        return {"status": "disabled", "document_id": document_id}

    async with AsyncSessionLocal() as session:
        row = await session.execute(
            text("SELECT id, tenant_id, kb_id, status FROM documents WHERE id = :id"),
            {"id": document_id},
        )
        doc = row.mappings().one_or_none()

    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc["status"] not in ("ready", "distilled", "distilling"):
        raise HTTPException(
            status_code=400,
            detail=f"Document must be in ready/distilled status, got: {doc['status']}",
        )

    async with AsyncSessionLocal() as session:
        chunk_rows = await session.execute(
            text(
                """
                SELECT content, chunk_index, token_count, page_number
                FROM chunks WHERE document_id = :id ORDER BY chunk_index
                """
            ),
            {"id": document_id},
        )
        from chunker import Chunk
        chunks = [
            Chunk(
                content=r["content"],
                chunk_index=r["chunk_index"],
                token_count=r["token_count"],
                page_number=r["page_number"],
            )
            for r in chunk_rows.mappings().fetchall()
        ]

    if not chunks:
        raise HTTPException(status_code=400, detail="Document has no chunks to distill")

    async def _run():
        try:
            await distill_document(
                document_id,
                str(doc["tenant_id"]),
                str(doc["kb_id"]),
                chunks,
            )
        except Exception:
            log.exception("distill.manual.unhandled_error", document_id=document_id)

    background_tasks.add_task(_run)
    log.info("distill.manual.queued", document_id=document_id)
    return {"status": "queued", "document_id": document_id}


@app.post("/promote", status_code=202)
async def trigger_promotion(
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
) -> dict:
    """Manually trigger one promotion cycle (for testing / admin use)."""
    _require_auth(authorization)

    if not settings.herald_enabled:
        return {"status": "disabled"}

    async def _run():
        try:
            promoted = await run_promotion_cycle()
            log.info("promoter.manual_cycle_complete", promoted=promoted)
        except Exception:
            log.exception("promoter.manual_cycle_error")

    background_tasks.add_task(_run)
    return {"status": "queued"}


@app.get("/status/{document_id}")
async def get_status(
    document_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    _require_auth(authorization)

    async with AsyncSessionLocal() as session:
        row = await session.execute(
            text(
                """
                SELECT status, chunk_count, node_count, error_message, indexed_at, distilled_at
                FROM documents WHERE id = :id
                """
            ),
            {"id": document_id},
        )
        doc = row.mappings().one_or_none()

    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    return {
        "document_id": document_id,
        "status": doc["status"],
        "chunk_count": doc["chunk_count"],
        "node_count": doc["node_count"],
        "error_message": doc["error_message"],
        "indexed_at": doc["indexed_at"].isoformat() if doc["indexed_at"] else None,
        "distilled_at": doc["distilled_at"].isoformat() if doc["distilled_at"] else None,
    }


@app.get("/health")
async def health() -> dict:
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "db": db_ok}
