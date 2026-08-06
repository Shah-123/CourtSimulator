"""Thin LLM helpers shared by the courtroom agents.

Every agent talks to the model through the same ``AsyncOpenAI`` client the rest
of the service uses (``embeddings.get_client``), so there is one auth path, one
place to add cost/latency instrumentation later, and one model setting. The
agents differ in their prompts and tools, not in how they reach the model.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.config import get_settings
from app.rag.embeddings import get_client

logger = logging.getLogger(__name__)


async def json_completion(
    system: str,
    user: str,
    *,
    max_tokens: int = 800,
    model: str | None = None,
) -> dict[str, Any]:
    """Runs a JSON-mode completion and parses the result.

    Returns ``{}`` on any failure rather than raising: an agent that cannot get
    a clean answer should fall back to a safe default (stay silent, overrule),
    not crash the whole turn.

    ``model`` overrides the default text model, for callers that cascade between
    a cheap and an expensive one.
    """
    settings = get_settings()
    try:
        response = await get_client().chat.completions.create(
            model=model or settings.model_text,
            max_completion_tokens=max_tokens,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        return json.loads(response.choices[0].message.content or "{}")
    except Exception:
        logger.exception("JSON completion failed")
        return {}


async def text_completion(
    system: str,
    user: str,
    *,
    history: list[dict[str, str]] | None = None,
    max_tokens: int = 400,
) -> str:
    """Runs a plain-text completion (used for in-character speech)."""
    settings = get_settings()
    messages: list[dict[str, str]] = [{"role": "system", "content": system}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user})
    try:
        response = await get_client().chat.completions.create(
            model=settings.model_text,
            max_completion_tokens=max_tokens,
            messages=messages,
        )
        return (response.choices[0].message.content or "").strip()
    except Exception:
        logger.exception("Text completion failed")
        return ""
