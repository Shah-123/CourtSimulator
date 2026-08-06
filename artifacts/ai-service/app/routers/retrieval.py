from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.rag.citations import audit_citations, format_audit_for_prompt
from app.rag.retrieval import format_sections_for_prompt, search_statutes

router = APIRouter(prefix="/rag", tags=["rag"])


class SearchRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int = Field(default=5, ge=1, le=25)
    statute_codes: list[str] | None = None
    rerank: bool = True


class VerifyRequest(BaseModel):
    text: str = Field(min_length=1)


@router.post("/search")
async def search(request: SearchRequest) -> dict:
    results = await search_statutes(
        request.query,
        top_k=request.top_k,
        statute_codes=request.statute_codes,
        rerank=request.rerank,
    )
    return {
        "results": [item.to_dict() for item in results],
        # Prompt construction lives here so callers never reimplement the
        # provenance labelling that keeps unverified text out of quotations.
        "promptBlock": format_sections_for_prompt(results),
    }


@router.post("/verify-citations")
async def verify(request: VerifyRequest) -> dict:
    audit = await audit_citations(request.text)
    return {
        "total": audit.total,
        "verified": audit.verified,
        "hallucinated": audit.hallucinated,
        "accuracy": audit.accuracy,
        "checks": [check.to_dict() for check in audit.checks],
        "promptBlock": format_audit_for_prompt(audit),
    }
