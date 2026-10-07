"""
Ollama embedding generation using nomic-embed-text (768 dims, free, local).

Replaces OpenAI text-embedding-3-small for zero-cost local embeddings.
Ollama must be running locally: https://ollama.com
Model: ollama pull nomic-embed-text
"""
from __future__ import annotations

import asyncio
import os

import httpx

from config import settings

OLLAMA_URL  = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/embeddings")
EMBED_MODEL = "nomic-embed-text"
EMBED_DIMS  = 768


def estimate_embed_cost(token_count: int, model: str = EMBED_MODEL) -> float:
    # Local model — always free
    return 0.0


async def _embed_batch_raw(texts: list[str]) -> list[list[float]]:
    """Call Ollama embeddings API for a list of texts."""
    embeddings: list[list[float]] = []
    async with httpx.AsyncClient(timeout=120.0) as client:
        for text in texts:
            response = await client.post(
                OLLAMA_URL,
                json={"model": EMBED_MODEL, "prompt": text},
            )
            response.raise_for_status()
            data = response.json()
            embeddings.append(data["embedding"])
    return embeddings


async def embed_batch(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts using Ollama."""
    if not texts:
        return []
    return await _embed_batch_raw(texts)


async def embed_all(texts: list[str]) -> list[list[float]]:
    """
    Embed an arbitrary number of texts in safe batches.
    Batches run sequentially to avoid overwhelming Ollama.
    """
    results: list[list[float]] = []
    batch_size = settings.embed_batch_size
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        embeddings = await embed_batch(batch)
        results.extend(embeddings)
        if i + batch_size < len(texts):
            await asyncio.sleep(0.05)
    return results


async def embed_query(query: str) -> list[float]:
    results = await embed_batch([query])
    return results[0]
