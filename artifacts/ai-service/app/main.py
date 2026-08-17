"""CourtSimulator reasoning service.

Owns retrieval, citation verification, agent memory and (from here on) the
multi-agent courtroom. The Express API remains the system of record for
sessions and the source of the OpenAPI contract the web app is generated from;
it calls this service for anything that requires reasoning.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import db
from app.config import get_settings
from app.rag.index import get_index, reload_index
from app.routers import casegen as casegen_router
from app.routers import courtroom as courtroom_router
from app.routers import retrieval as retrieval_router
from app.routers import verdict as verdict_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await db.init_pool()
    # Build the index at startup rather than on first request, so the first
    # student of the day does not pay for it.
    index = await get_index()
    logger.info(
        "Ready: %d provisions indexed (%d embedded)",
        index.size,
        index.embedded_count,
    )
    yield
    await db.close_pool()


app = FastAPI(
    title="CourtSimulator Service",
    version="0.1.0",
    description="Retrieval, grounding and agentic reasoning for CourtSimulator",
    lifespan=lifespan,
)

app.include_router(retrieval_router.router)
app.include_router(courtroom_router.router)
app.include_router(verdict_router.router)
app.include_router(casegen_router.router)


@app.get("/healthz", tags=["health"])
async def healthz() -> dict:
    index = await get_index()
    settings = get_settings()
    return {
        "status": "ok",
        "provisions": index.size,
        "embedded": index.embedded_count,
        "statutes": sorted(index.statute_codes()),
        "embeddingModel": settings.model_embedding,
        "rerankerBackend": settings.reranker_backend,
    }


@app.post("/admin/reload-index", tags=["health"])
async def admin_reload_index() -> dict:
    """Rebuilds the in-memory indexes after statute ingestion."""
    index = await reload_index()
    return {"provisions": index.size, "embedded": index.embedded_count}
