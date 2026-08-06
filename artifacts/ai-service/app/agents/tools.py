"""Tools the courtroom agents can call.

A "tool" here is a function an agent invokes to reach outside its own context —
to read statute it has not been handed. The judge's ReAct loop calls
``search_statute`` through the OpenAI tool-calling API (schema in
``SEARCH_STATUTE_TOOL``, executed by ``run_search_statute``). The tool is the
single grounded path to the corpus, so nothing an agent says about the law is
ungrounded.
"""

from __future__ import annotations

import json
from typing import Any

from app.rag.retrieval import search_statutes

# OpenAI tool schema for the judge's tool-calling loop.
SEARCH_STATUTE_TOOL: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "search_statute",
        "description": (
            "Search the Pakistani statute corpus (QSO 1984, PPC 1860, CrPC "
            "1898, Constitution 1973) for the provisions that govern a legal "
            "question. Use this to read the actual text before ruling; do not "
            "rule on statute you have not read."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                # The Thought half of Thought-Action-Observation, carried as a
                # tool argument rather than read off the assistant message.
                # Under tool_choice="auto" a model that decides to call a tool
                # usually returns content=None, so harvesting the thought from
                # the message text yielded an empty string on every step and
                # the UI showed a two-thirds ReAct loop. A required argument
                # cannot come back empty, and it binds the reasoning to the
                # specific call it justifies.
                "thought": {
                    "type": "string",
                    "description": (
                        "One sentence, before you read anything: what you need "
                        "to check in the statute book and why it decides this "
                        "objection."
                    ),
                },
                "query": {
                    "type": "string",
                    "description": "The legal question or issue to find law for.",
                },
                "statute_codes": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": (
                        "Optional filter, e.g. ['QSO_1984','CRPC_1898']. Omit "
                        "to search the whole corpus."
                    ),
                },
            },
            "required": ["thought", "query"],
        },
    },
}


async def run_search_statute(arguments: str) -> tuple[str, list[dict]]:
    """Executes a ``search_statute`` tool call.

    Returns a compact observation string for the model plus the structured
    provisions retrieved, so the caller can both feed the model and record
    provenance for the UI.
    """
    try:
        parsed = json.loads(arguments or "{}")
    except json.JSONDecodeError:
        parsed = {}

    query = (parsed.get("query") or "").strip()
    codes = parsed.get("statute_codes") or None
    if not query:
        return "No query supplied.", []

    results = await search_statutes(query, top_k=4, statute_codes=codes, rerank=True)
    if not results:
        return "No provisions matched that query.", []

    provisions = [
        {
            "citation": item.section.citation,
            "heading": item.section.heading,
            "content": item.section.content,
            "verified": item.section.verified,
        }
        for item in results
    ]
    observation = "\n\n".join(
        f"{p['citation']} — {p['heading']}\n{p['content']}"
        + ("" if p["verified"] else " [UNVERIFIED TEXT]")
        for p in provisions
    )
    return observation, provisions
