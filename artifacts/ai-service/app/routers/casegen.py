"""Case generation endpoint.

Thin HTTP wrapper over app.casegen.generate_case. This route exists so the
Express API stops building a prompt of its own: generation is reasoning, and
reasoning lives in this service.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.casegen import generate_case

router = APIRouter(tags=["cases"])

_CAMEL = ConfigDict(populate_by_name=True)


class CaseGenerateRequest(BaseModel):
    model_config = _CAMEL
    area_of_law: str = Field(alias="areaOfLaw")
    difficulty: str


@router.post("/cases/generate")
async def cases_generate(request: CaseGenerateRequest) -> dict:
    try:
        return await generate_case(request.area_of_law, request.difficulty)
    except ValueError as err:
        # The model returned something we will not persist as a case.
        raise HTTPException(status_code=422, detail=str(err)) from err
