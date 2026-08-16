"""Runs the evaluation suite: retrieval quality, AI-judge reliability, courtroom.

    python -m eval.run_eval                 # retrieval + judge (the fast gate)
    python -m eval.run_eval --judge-runs 5
    python -m eval.run_eval --retrieval-only
    python -m eval.run_eval --judge-only
    python -m eval.run_eval --courtroom     # add the courtroom agents
    python -m eval.run_eval --courtroom-only

The courtroom section is opt-in rather than part of the default run: it drives
the full multi-agent graph once per scenario, so it costs minutes and real
tokens where the other two are cheaper. Run it when agents, agent prompts or
model routing change — not on every push.

Every section reports its own spend. The default gate is not free: reranking is
an LLM call per query and the judge scores each transcript three times, so a
full run is tens of gpt-4o calls. `--no-rerank --retrieval-only` costs only
embeddings (fractions of a cent) and is the cheap way to sanity-check a corpus
change before paying for the real thing.
"""

from __future__ import annotations

import argparse
import asyncio

from app import db
from app.rag.index import get_index
from app.telemetry import track
from eval.courtroom_eval import evaluate_courtroom
from eval.courtroom_eval import print_report as print_courtroom
from eval.judge_eval import evaluate_judge
from eval.judge_eval import print_report as print_judge
from eval.retrieval_eval import evaluate_retrieval
from eval.retrieval_eval import print_report as print_retrieval
from eval.witness_eval import evaluate_witness
from eval.witness_eval import print_report as print_witness


def _print_spend(label: str, ledger) -> None:
    """Reports what a section actually cost.

    The courtroom section has always metered itself; this one did not, so the
    only figure available for the fast gate was an estimate from call counts.
    An eval whose price has to be guessed is one people avoid re-running, and
    the whole standard here is that a number beats a guess.
    """
    if ledger.calls == 0:
        return
    print(
        f"\n  {label} spend: ${ledger.cost:.4f} over {ledger.calls} calls"
        f"  ({ledger.prompt_tokens:,} in / {ledger.completion_tokens:,} out)"
    )
    print(f"  by model: {ledger.by_model}")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Adalat AI evaluation suite")
    parser.add_argument("--judge-runs", type=int, default=3)
    parser.add_argument("--no-rerank", action="store_true", help="retrieval: fusion only")
    parser.add_argument("--retrieval-only", action="store_true")
    parser.add_argument("--judge-only", action="store_true")
    parser.add_argument("--courtroom", action="store_true", help="add courtroom agents")
    parser.add_argument("--courtroom-only", action="store_true")
    parser.add_argument("--courtroom-limit", type=int, default=None)
    parser.add_argument("--witness", action="store_true", help="add witness grounding")
    args = parser.parse_args()

    await db.init_pool()
    try:
        index = await get_index()
        print(f"corpus: {index.size} provisions, {index.embedded_count} embedded")

        if not args.judge_only and not args.courtroom_only:
            rerank = not args.no_rerank
            with track() as ledger:
                results = await evaluate_retrieval(rerank=rerank)
            print_retrieval(results, "reranked (LLM)" if rerank else "fusion only (RRF)")
            _print_spend("retrieval", ledger)

        if not args.retrieval_only and not args.courtroom_only:
            with track() as ledger:
                judge_results = await evaluate_judge(args.judge_runs)
            print_judge(judge_results, args.judge_runs)
            _print_spend("judge", ledger)

        if args.courtroom or args.courtroom_only:
            court_results = await evaluate_courtroom(limit=args.courtroom_limit)
            print_courtroom(court_results)

        # Opt-in alongside the courtroom: this drives the witness agent, so it
        # is not part of the fast gate for the same reason the courtroom is not.
        if args.witness or args.courtroom_only:
            with track() as ledger:
                witness_results = await evaluate_witness()
            print_witness(witness_results)
            _print_spend("witness", ledger)
    finally:
        await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
