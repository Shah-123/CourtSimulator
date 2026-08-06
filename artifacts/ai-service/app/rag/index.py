"""In-memory statute index: dense vectors plus a BM25 lexical index.

The corpus is a few thousand provisions at most, so an exact numpy scan beats
an approximate index on both latency and recall, and it removes any need for
the pgvector extension. Both indexes are built once at startup and rebuilt on
demand after ingestion.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass

import numpy as np
from rank_bm25 import BM25Okapi

from app import db
from app.config import get_settings

logger = logging.getLogger(__name__)

_TOKEN_PATTERN = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


def tokenize(text: str) -> list[str]:
    """Lowercase word tokenizer that keeps hyphenated legal terms intact.

    "qatl-i-amd" and "qanun-e-shahadat" are single terms in this domain;
    splitting them on hyphens would scatter their weight across meaningless
    fragments like "i" and "e".
    """
    return _TOKEN_PATTERN.findall(text.lower())


@dataclass(frozen=True, slots=True)
class StatuteSection:
    id: int
    statute_code: str
    statute_title: str
    section_number: str
    citation: str
    heading: str
    chapter: str | None
    content: str
    verified: bool
    source_url: str | None


class CorpusIndex:
    """Dense + lexical indexes over the statute corpus."""

    def __init__(
        self,
        sections: list[StatuteSection],
        matrix: np.ndarray,
        embedded_ids: list[int],
        bm25: BM25Okapi | None,
    ) -> None:
        self.sections = sections
        self.by_id = {section.id: section for section in sections}
        self.matrix = matrix
        self.embedded_ids = embedded_ids
        self.bm25 = bm25

    @property
    def size(self) -> int:
        return len(self.sections)

    @property
    def embedded_count(self) -> int:
        return len(self.embedded_ids)

    def statute_codes(self) -> set[str]:
        return {section.statute_code for section in self.sections}


_index: CorpusIndex | None = None
_lock = asyncio.Lock()

_LOAD_QUERY = """
    SELECT id, statute_code, statute_title, section_number, citation,
           heading, chapter, content, verified, source_url,
           embedding, embedding_model
    FROM statute_sections
    ORDER BY id
"""


async def build_index() -> CorpusIndex:
    settings = get_settings()
    rows = await db.fetch(_LOAD_QUERY)

    sections: list[StatuteSection] = []
    vectors: list[np.ndarray] = []
    embedded_ids: list[int] = []
    skipped_model = 0

    for row in rows:
        sections.append(
            StatuteSection(
                id=row["id"],
                statute_code=row["statute_code"],
                statute_title=row["statute_title"],
                section_number=row["section_number"],
                citation=row["citation"],
                heading=row["heading"],
                chapter=row["chapter"],
                content=row["content"],
                verified=row["verified"],
                source_url=row["source_url"],
            )
        )

        embedding = row["embedding"]
        if not embedding:
            continue
        # Guard against a half-completed re-index leaving two embedding
        # spaces in the same table.
        if row["embedding_model"] != settings.model_embedding:
            skipped_model += 1
            continue

        vector = np.asarray(embedding, dtype=np.float32)
        norm = float(np.linalg.norm(vector))
        vectors.append(vector / norm if norm else vector)
        embedded_ids.append(row["id"])

    matrix = (
        np.vstack(vectors)
        if vectors
        else np.empty((0, settings.embedding_dimensions), dtype=np.float32)
    )

    bm25 = (
        BM25Okapi([tokenize(f"{s.heading} {s.content}") for s in sections])
        if sections
        else None
    )

    if skipped_model:
        logger.warning(
            "%d provisions were embedded with a different model and are "
            "excluded from vector search; re-run statute ingestion with --force",
            skipped_model,
        )

    logger.info(
        "Statute index built: %d provisions, %d embedded, BM25 %s",
        len(sections),
        len(embedded_ids),
        "ready" if bm25 else "empty",
    )
    return CorpusIndex(sections, matrix, embedded_ids, bm25)


async def get_index() -> CorpusIndex:
    global _index
    if _index is None:
        async with _lock:
            if _index is None:
                _index = await build_index()
    return _index


async def reload_index() -> CorpusIndex:
    """Rebuilds the index. Call after ingesting or re-embedding statutes."""
    global _index
    async with _lock:
        _index = await build_index()
    return _index
