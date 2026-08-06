"""Runs the evaluation suite: retrieval quality, AI-judge reliability, courtroom.

    python -m eval.run_eval                 # retrieval + judge (the fast gate)
    python -m eval.run_eval --judge-runs 5
    python -m eval.run_eval --retrieval-only
    python -m eval.run_eval --judge-only
    python -m eval.run_eval --courtroom     # add the courtroom agents
    python -m eval.run_eval --courtroom-only

The courtroom section is opt-in rather than part of the default run: it drives
the full multi-agent graph once per scenario, so it costs minutes and real
tokens where the other two are comparatively cheap. Run it when agents, agent
prompts or model routing change — not on every push.
"""

from __future__ import annotations

import argparse
import asyncio

from app import db
from app.rag.index import get_index
from eval.courtroom_eval import evaluate_courtroom
from eval.courtroom_eval import print_report as print_courtroom
from eval.judge_eval import evaluate_judge
from eval.judge_eval import print_report as print_judge
from eval.retrieval_eval import evaluate_retrieval
from eval.retrieval_eval import print_report as print_retrieval


async def main() -> None:
    parser = argparse.ArgumentParser(description="Adalat AI evaluation suite")
    parser.add_argument("--judge-runs", type=int, default=3)
    parser.add_argument("--no-rerank", action="store_true", help="retrieval: fusion only")
    parser.add_argument("--retrieval-only", action="store_true")
    parser.add_argument("--judge-only", action="store_true")
    parser.add_argument("--courtroom", action="store_true", help="add courtroom agents")
    parser.add_argument("--courtroom-only", action="store_true")
    parser.add_argument("--courtroom-limit", type=int, default=None)
    args = parser.parse_args()

    await db.init_pool()
    try:
        index = await get_index()
        print(f"corpus: {index.size} provisions, {index.embedded_count} embedded")

        if not args.judge_only and not args.courtroom_only:
            rerank = not args.no_rerank
            results = await evaluate_retrieval(rerank=rerank)
            print_retrieval(results, "reranked (LLM)" if rerank else "fusion only (RRF)")

        if not args.retrieval_only and not args.courtroom_only:
            judge_results = await evaluate_judge(args.judge_runs)
            print_judge(judge_results, args.judge_runs)

        if args.courtroom or args.courtroom_only:
            court_results = await evaluate_courtroom(limit=args.courtroom_limit)
            print_courtroom(court_results)
    finally:
        await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
