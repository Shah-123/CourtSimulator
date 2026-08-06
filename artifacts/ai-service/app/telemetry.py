"""Cost and latency accounting for every model call this service makes.

Instrumentation hangs off the shared OpenAI client rather than the call sites.
There are eight places that reach the API — the agents, the judge's ReAct loop,
memory summarisation, the reranker, verdict scoring, embeddings — and a cost
figure that silently misses one of them is worse than no figure at all, because
it looks authoritative. Wrapping the client once means a new call site is
counted whether or not whoever added it remembered to.

Recording is scoped to a ledger with :func:`track`. Outside one, calls are not
recorded at all, so nothing accumulates in a long-running process and there is
no cost to leaving this in place.

Prices are pinned here rather than fetched. An eval that reports a different
cost depending on the day it ran is not a measurement, and CI has no business
making a pricing call to answer "did this change get cheaper". The trade is that
they go stale: **verify these against current OpenAI pricing before quoting a
figure**. ``openai_cost_calculator`` is installed if live pricing is ever wanted.
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field

# USD per 1M tokens, as (input, output). Last checked 2026-08-04 — unverified
# against the pricing page, treat as approximate.
PRICES: dict[str, tuple[float, float]] = {
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "text-embedding-3-small": (0.02, 0.0),
    "text-embedding-3-large": (0.13, 0.0),
}

# An unknown model is priced as the expensive one. Guessing low would quietly
# understate cost, which is the direction that misleads.
FALLBACK_PRICE = (2.50, 10.00)


def price_for(model: str) -> tuple[float, float]:
    if model in PRICES:
        return PRICES[model]
    # "gpt-4o-2024-11-20" and friends: match the longest known prefix.
    candidates = [name for name in PRICES if model.startswith(name)]
    if candidates:
        return PRICES[max(candidates, key=len)]
    return FALLBACK_PRICE


@dataclass(slots=True)
class CallRecord:
    model: str
    prompt_tokens: int
    completion_tokens: int
    seconds: float

    @property
    def cost(self) -> float:
        in_price, out_price = price_for(self.model)
        return (
            self.prompt_tokens * in_price + self.completion_tokens * out_price
        ) / 1_000_000


@dataclass(slots=True)
class UsageLedger:
    records: list[CallRecord] = field(default_factory=list)

    @property
    def calls(self) -> int:
        return len(self.records)

    @property
    def prompt_tokens(self) -> int:
        return sum(r.prompt_tokens for r in self.records)

    @property
    def completion_tokens(self) -> int:
        return sum(r.completion_tokens for r in self.records)

    @property
    def cost(self) -> float:
        return sum(r.cost for r in self.records)

    @property
    def by_model(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for record in self.records:
            counts[record.model] = counts.get(record.model, 0) + 1
        return counts


_LEDGER: ContextVar[UsageLedger | None] = ContextVar("usage_ledger", default=None)


@contextmanager
def track() -> Iterator[UsageLedger]:
    """Collects every model call made inside the block.

    A ContextVar rather than a module global so two turns running concurrently
    do not pour their usage into each other's ledger.
    """
    ledger = UsageLedger()
    token = _LEDGER.set(ledger)
    try:
        yield ledger
    finally:
        _LEDGER.reset(token)


def record(model: str, usage: object, seconds: float) -> None:
    """Adds one call to the active ledger, if there is one."""
    ledger = _LEDGER.get()
    if ledger is None:
        return
    ledger.records.append(
        CallRecord(
            model=model,
            prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
            completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
            seconds=seconds,
        )
    )


def instrument(client):
    """Wraps a client's create() calls so usage is recorded automatically.

    Assigning over the bound methods on the instance is deliberate: the
    alternative is touching all eight call sites and hoping the ninth remembers.
    """
    resources = (
        (client.chat.completions, "create"),
        (client.embeddings, "create"),
    )
    for resource, attr in resources:
        original = getattr(resource, attr)

        def wrapper(*args, _original=original, **kwargs):
            async def call():
                started = time.perf_counter()
                response = await _original(*args, **kwargs)
                record(
                    kwargs.get("model", "unknown"),
                    getattr(response, "usage", None),
                    time.perf_counter() - started,
                )
                return response

            return call()

        setattr(resource, attr, wrapper)

    return client
