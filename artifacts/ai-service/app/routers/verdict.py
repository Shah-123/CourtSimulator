"""Verdict scoring endpoint.

Thin HTTP wrapper over app.verdict.score_session so the Express API grades a
completed session with the same judge the evaluation harness measures.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.verdict import score_session

router = APIRouter(tags=["verdict"])

_CAMEL = ConfigDict(populate_by_name=True)


class VerdictTurn(BaseModel):
    model_config = _CAMEL
    phase: str = ""
    speaker: str = ""
    witness_name: str | None = Field(default=None, alias="witnessName")
    transcript: str = ""


class VerdictScoreRequest(BaseModel):
    model_config = _CAMEL
    title: str
    area_of_law: str = Field(alias="areaOfLaw")
    summary: str
    applicable_laws: str = Field(alias="applicableLaws")
    student_side: str = Field(alias="studentSide")
    turns: list[VerdictTurn] = Field(default_factory=list)


@router.post("/verdict/score")
async def verdict_score(request: VerdictScoreRequest) -> dict:
    try:
        return await score_session(
            title=request.title,
            area_of_law=request.area_of_law,
            summary=request.summary,
            applicable_laws=request.applicable_laws,
            student_side=request.student_side,
            turns=[turn.model_dump(by_alias=True) for turn in request.turns],
        )
    except ValueError as err:
        # The model returned something we will not persist as a verdict.
        raise HTTPException(status_code=422, detail=str(err)) from err
