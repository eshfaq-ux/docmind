"""
FastAPI ingestion service.

Endpoints:
  POST /ingest/{document_id}   — trigger ingestion (called by Next.js)
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

# ── Structured logging ─────────────────────────────────────────────────────────
structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
)
log = structlog.get_logger()

# ── Semaphore: limit concurrent ingestions ─────────────────────────────────────
_ingest_sem = asyncio.Semaphore(settings.max_concurrent_ingestions)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("backend.startup", max_concurrent=settings.max_concurrent_ingestions)
    yield
    await engine.dispose()
    log.info("backend.shutdown")


app = FastAPI(title="DocMind Ingestion Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Next.js frontend only; further locked down via secret
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


# ── Auth helper ───────────────────────────────────────────────────────────────

def _require_auth(authorization: str | None) -> None:
    expected = f"Bearer {settings.backend_secret}"
    if not authorization or authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


# ── Request models ─────────────────────────────────────────────────────────────

class IngestRequest(BaseModel):
    tenant_id: str  # validated but not required by pipeline (already in DB row)


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
                SELECT status, chunk_count, error_message, indexed_at
                FROM documents
                WHERE id = :id
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
        "error_message": doc["error_message"],
        "indexed_at": doc["indexed_at"].isoformat() if doc["indexed_at"] else None,
    }


@app.get("/health")
async def health() -> dict:
    # Verify DB connectivity
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "db": db_ok}
