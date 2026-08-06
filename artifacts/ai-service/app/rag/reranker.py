"""Reranking backends.

Retrieval is a bi-encoder problem: query and document are embedded separately,
so the model never sees them together and cannot judge whether a provision
actually *governs* a question or merely shares its vocabulary. A cross-encoder
scores the pair jointly, which is what promotes the controlling provision above
the merely topical one.

Two backends are provided because they trade off differently:

* ``cross_encoder`` runs a small local model (~80MB). ~20ms for 15 candidates,
  no token cost, works offline once the weights are cached.
* ``llm`` asks the text model to score relevance. No local weights and better
  at genuinely novel phrasing, but adds seconds of latency and costs tokens.

The cross-encoder degrades to the LLM backend, and the LLM backend degrades to
the unmodified fusion ordering. Reranking is an optimisation, never a
dependency.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Protocol

from app.config import get_settings

logger = logging.getLogger(__name__)


class Reranker(Protocol):
    name: str

    async def score(self, query: str, documents: list[str]) -> list[float]: ...


class CrossEncoderReranker:
    """Local sentence-transformers cross-encoder."""

    name = "cross_encoder"

    def __init__(self, model_name: str) -> None:
        self.model_name = model_name
        self._model = None
        self._lock = asyncio.Lock()

    async def _ensure_model(self):
        if self._model is None:
            async with self._lock:
                if self._model is None:
                    # Imported lazily so the service starts without torch
                    # installed, falling back to the LLM backend instead.
                    from sentence_transformers import CrossEncoder

                    logger.info("Loading cross-encoder %s", self.model_name)
                    self._model = await asyncio.to_thread(
                        CrossEncoder, self.model_name
                    )
        return self._model

    async def score(self, query: str, documents: list[str]) -> list[float]:
        model = await self._ensure_model()
        pairs = [(query, document) for document in documents]
        # predict() is blocking CPU work; keep it off the event loop.
        scores = await asyncio.to_thread(model.predict, pairs)
        return [float(score) for score in scores]


class LLMReranker:
    """Asks the text model to score each candidate's legal applicability."""

    name = "llm"

    _SYSTEM_PROMPT = (
        "You rank Pakistani statutory provisions by how directly they govern a "
        "legal question. Judge legal applicability, not topical similarity: a "
        "provision that merely mentions the same subject matter scores low, a "
        "provision that supplies the operative rule scores high."
    )

    async def score(self, query: str, documents: list[str]) -> list[float]:
        from app.rag.embeddings import get_client

        settings = get_settings()
        numbered = "\n\n".join(
            f"[{i}] {document[:600]}" for i, document in enumerate(documents)
        )

        response = await get_client().chat.completions.create(
            model=settings.model_text,
            max_completion_tokens=1024,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": self._SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"Legal question:\n{query}\n\n"
                        f"Candidate provisions:\n{numbered}\n\n"
                        'Respond with strict JSON: {"rankings": '
                        '[{"index": number, "score": number}]} where score is '
                        "0-10 relevance. Include every candidate index exactly once."
                    ),
                },
            ],
        )

        payload = json.loads(response.choices[0].message.content or "{}")
        scores = [0.0] * len(documents)
        for entry in payload.get("rankings", []):
            index = entry.get("index")
            if isinstance(index, int) and 0 <= index < len(documents):
                scores[index] = float(entry.get("score", 0.0))
        return scores


class NullReranker:
    name = "none"

    async def score(self, query: str, documents: list[str]) -> list[float]:
        # Descending so the caller's stable sort preserves fusion order.
        return [float(len(documents) - i) for i in range(len(documents))]


_reranker: Reranker | None = None


def get_reranker() -> Reranker:
    global _reranker
    if _reranker is None:
        settings = get_settings()
        backend = settings.reranker_backend
        if backend == "cross_encoder":
            _reranker = CrossEncoderReranker(settings.reranker_model)
        elif backend == "llm":
            _reranker = LLMReranker()
        else:
            _reranker = NullReranker()
    return _reranker


async def rerank_scores(query: str, documents: list[str]) -> tuple[list[float], str]:
    """Scores documents, degrading gracefully if a backend is unavailable.

    Returns the scores and the backend that actually produced them, so callers
    can report which path ran rather than assuming the configured one did.
    """
    reranker = get_reranker()
    try:
        return await reranker.score(query, documents), reranker.name
    except Exception:
        logger.exception("Reranker %s failed", reranker.name)

    if reranker.name == "cross_encoder":
        try:
            fallback = LLMReranker()
            return await fallback.score(query, documents), fallback.name
        except Exception:
            logger.exception("LLM reranker fallback failed")

    null = NullReranker()
    return await null.score(query, documents), null.name
