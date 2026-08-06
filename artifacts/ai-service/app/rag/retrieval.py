"""Hybrid statute retrieval: BM25 + dense vectors, fused with RRF, then reranked.

Hybrid matters here because legal queries are bimodal. "Section 302" and
"qatl-i-amd" are exact lexical hits that embeddings blur into a cloud of
adjacent provisions, while "the witness is repeating what someone else told
him" shares no vocabulary at all with Article 71 and only dense retrieval finds
it. Neither retriever alone covers the query distribution.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np

from app.config import get_settings
from app.rag.embeddings import embed_query
from app.rag.index import CorpusIndex, StatuteSection, get_index, tokenize
from app.rag.reranker import rerank_scores

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class RetrievalScores:
    """Per-retriever contribution, kept so results stay explainable."""

    lexical_rank: int | None = None
    bm25_score: float | None = None
    vector_rank: int | None = None
    vector_similarity: float | None = None
    rrf: float = 0.0
    rerank: float | None = None
    reranker_backend: str | None = None


@dataclass(slots=True)
class RetrievedSection:
    section: StatuteSection
    scores: RetrievalScores

    def to_dict(self) -> dict:
        # camelCase across the wire: this payload is consumed by the Node API
        # and ultimately the OpenAPI contract, which are camelCase throughout.
        section = self.section
        scores = self.scores
        return {
            "id": section.id,
            "statuteCode": section.statute_code,
            "statuteTitle": section.statute_title,
            "sectionNumber": section.section_number,
            "citation": section.citation,
            "heading": section.heading,
            "chapter": section.chapter,
            "content": section.content,
            "verified": section.verified,
            "sourceUrl": section.source_url,
            "scores": {
                "lexicalRank": scores.lexical_rank,
                "bm25Score": scores.bm25_score,
                "vectorRank": scores.vector_rank,
                "vectorSimilarity": scores.vector_similarity,
                "rrf": scores.rrf,
                "rerank": scores.rerank,
                "rerankerBackend": scores.reranker_backend,
            },
        }


def _bm25_search(
    index: CorpusIndex,
    query: str,
    limit: int,
    allowed: set[int] | None,
) -> dict[int, tuple[int, float]]:
    """Returns {section_id: (rank, bm25_score)}."""
    if index.bm25 is None:
        return {}

    scores = index.bm25.get_scores(tokenize(query))

    candidates = [
        (index.sections[i].id, float(score))
        for i, score in enumerate(scores)
        # BM25 assigns 0 to documents sharing no query term. Keeping them
        # would pad the fusion with noise that outranks nothing but still
        # consumes candidate slots.
        if score > 0.0
        and (allowed is None or index.sections[i].id in allowed)
    ]
    candidates.sort(key=lambda item: item[1], reverse=True)

    return {
        section_id: (rank, score)
        for rank, (section_id, score) in enumerate(candidates[:limit], start=1)
    }


async def _vector_search(
    index: CorpusIndex,
    query: str,
    limit: int,
    allowed: set[int] | None,
) -> dict[int, tuple[int, float]]:
    """Returns {section_id: (rank, cosine_similarity)}."""
    if index.matrix.shape[0] == 0:
        return {}

    query_vector = await embed_query(query)
    # Both sides are L2-normalised, so the dot product is cosine similarity.
    similarities = index.matrix @ query_vector

    order = np.argsort(-similarities)
    results: dict[int, tuple[int, float]] = {}

    for position in order:
        section_id = index.embedded_ids[int(position)]
        if allowed is not None and section_id not in allowed:
            continue
        results[section_id] = (len(results) + 1, float(similarities[position]))
        if len(results) >= limit:
            break

    return results


async def search_statutes(
    query: str,
    *,
    top_k: int = 5,
    candidate_k: int | None = None,
    statute_codes: list[str] | None = None,
    rerank: bool = True,
) -> list[RetrievedSection]:
    settings = get_settings()
    index = await get_index()
    if index.size == 0:
        return []

    candidate_k = candidate_k or max(20, top_k * 4)

    allowed: set[int] | None = None
    if statute_codes:
        wanted = set(statute_codes)
        allowed = {s.id for s in index.sections if s.statute_code in wanted}
        if not allowed:
            return []

    lexical = _bm25_search(index, query, candidate_k, allowed)
    vector = await _vector_search(index, query, candidate_k, allowed)

    # Reciprocal Rank Fusion. Ranks rather than raw scores, because BM25
    # scores are unbounded and cosine similarities sit in a narrow band —
    # combining them directly would let BM25 dominate arbitrarily.
    fused: dict[int, float] = {}
    for section_id, (rank, _) in lexical.items():
        fused[section_id] = fused.get(section_id, 0.0) + 1.0 / (settings.rrf_k + rank)
    for section_id, (rank, _) in vector.items():
        fused[section_id] = fused.get(section_id, 0.0) + 1.0 / (settings.rrf_k + rank)

    if not fused:
        return []

    # Rerank a wider slice than we return, so the cross-encoder can promote a
    # provision the bi-encoders ranked just below the cut.
    slice_size = min(top_k * 3, len(fused)) if rerank else min(top_k, len(fused))
    ordered_ids = [
        section_id
        for section_id, _ in sorted(fused.items(), key=lambda kv: kv[1], reverse=True)
    ][:slice_size]

    results = [
        RetrievedSection(
            section=index.by_id[section_id],
            scores=RetrievalScores(
                lexical_rank=lexical.get(section_id, (None, None))[0],
                bm25_score=lexical.get(section_id, (None, None))[1],
                vector_rank=vector.get(section_id, (None, None))[0],
                vector_similarity=vector.get(section_id, (None, None))[1],
                rrf=fused[section_id],
            ),
        )
        for section_id in ordered_ids
    ]

    if not rerank or len(results) <= 1:
        return results[:top_k]

    documents = [
        f"{item.section.citation} — {item.section.heading}\n{item.section.content}"
        for item in results
    ]
    scores, backend = await rerank_scores(query, documents)

    for item, score in zip(results, scores, strict=True):
        item.scores.rerank = score
        item.scores.reranker_backend = backend

    results.sort(key=lambda item: item.scores.rerank or 0.0, reverse=True)
    return results[:top_k]


def format_sections_for_prompt(sections: list[RetrievedSection]) -> str:
    """Renders provisions as a prompt block.

    Unverified provisions are labelled inline so neither the model nor anything
    downstream that echoes the block can present unchecked text as settled law.
    """
    if not sections:
        return "(No statutory provisions were retrieved for this question.)"

    blocks = []
    for item in sections:
        provenance = (
            ""
            if item.section.verified
            else " [UNVERIFIED TEXT — do not quote verbatim as authoritative]"
        )
        blocks.append(
            f"{item.section.citation} — {item.section.heading}{provenance}\n"
            f"{item.section.content}"
        )
    return "\n\n---\n\n".join(blocks)
