"""Query embedding.

Corpus embeddings are produced by `scripts/ingest-statutes.mjs` on the Node
side. This module only embeds queries, and must use the same model — mixing
embedding spaces silently returns nonsense rather than failing, so the model
name is asserted against what the ingest job recorded.
"""

from __future__ import annotations

import numpy as np
from openai import AsyncOpenAI

from app.config import get_settings
from app.telemetry import instrument

_client: AsyncOpenAI | None = None


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        # Instrumented here because every model call in the service comes
        # through this one accessor. See app.telemetry for why cost accounting
        # is not attached at the individual call sites.
        _client = instrument(AsyncOpenAI(api_key=get_settings().openai_api_key))
    return _client


async def embed_query(text: str) -> np.ndarray:
    """Embeds a single query and returns an L2-normalised float32 vector."""
    settings = get_settings()
    response = await get_client().embeddings.create(
        model=settings.model_embedding,
        input=[text],
    )
    vector = np.asarray(response.data[0].embedding, dtype=np.float32)
    return normalise(vector)


async def embed_texts(texts: list[str], batch_size: int = 64) -> np.ndarray:
    """Embeds many texts, preserving input order."""
    if not texts:
        return np.empty((0, get_settings().embedding_dimensions), dtype=np.float32)

    settings = get_settings()
    out: list[np.ndarray] = [np.empty(0)] * len(texts)

    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        response = await get_client().embeddings.create(
            model=settings.model_embedding,
            input=batch,
        )
        # The API does not guarantee ordering; place by returned index.
        for item in response.data:
            out[start + item.index] = np.asarray(item.embedding, dtype=np.float32)

    return np.vstack([normalise(v) for v in out])


def normalise(vector: np.ndarray) -> np.ndarray:
    """L2-normalises so cosine similarity reduces to a dot product."""
    norm = float(np.linalg.norm(vector))
    return vector if norm == 0.0 else (vector / norm).astype(np.float32)
