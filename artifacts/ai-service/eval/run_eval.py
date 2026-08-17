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

Every run is recorded to MLflow when it is installed — metrics, the settings
that produced them, the commit, and the printed report as an artifact. See
`eval/tracking.py`; `ADALAT_MLFLOW=0` turns it off and nothing else changes.

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
from eval.courtroom_eval import summarise as summarise_courtroom
from eval.judge_eval import evaluate_judge
from eval.judge_eval import print_report as print_judge
from eval.judge_eval import summarise as summarise_judge
from eval.retrieval_eval import evaluate_retrieval
from eval.retrieval_eval import print_report as print_retrieval
from eval.retrieval_eval import summarise as summarise_retrieval
from eval.tracking import Recorder, tracked_run
from eval.witness_eval import evaluate_witness
from eval.witness_eval import print_report as print_witness
from eval.witness_eval import summarise as summarise_witness


def _spend(label: str, ledger, recorder: Recorder) -> None:
    """Reports what a section actually cost, and records it against the run.

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
    recorder.metrics(
        label,
        {
            "cost_usd": ledger.cost,
            "calls": ledger.calls,
            "prompt_tokens": ledger.prompt_tokens,
            "completion_tokens": ledger.completion_tokens,
        },
    )


async def main() -> None:
    parser = argparse.ArgumentParser(description="CourtSimulator evaluation suite")
    parser.add_argument("--judge-runs", type=int, default=3)
    parser.add_argument("--no-rerank", action="store_true", help="retrieval: fusion only")
    parser.add_argument("--retrieval-only", action="store_true")
    parser.add_argument("--judge-only", action="store_true")
    parser.add_argument("--courtroom", action="store_true", help="add courtroom agents")
    parser.add_argument("--courtroom-only", action="store_true")
    parser.add_argument("--courtroom-limit", type=int, default=None)
    parser.add_argument("--witness", action="store_true", help="add witness grounding")
    args = parser.parse_args()

    want_retrieval = not args.judge_only and not args.courtroom_only
    want_judge = not args.retrieval_only and not args.courtroom_only
    want_courtroom = args.courtroom or args.courtroom_only
    want_witness = args.witness or args.courtroom_only
    sections = [
        name
        for name, wanted in (
            ("retrieval", want_retrieval),
            ("judge", want_judge),
            ("courtroom", want_courtroom),
            ("witness", want_witness),
        )
        if wanted
    ]
    rerank = not args.no_rerank

    await db.init_pool()
    try:
        index = await get_index()
        # The run is named for what it covered, because "eval" alone in a list
        # of runs cannot be told apart from a --retrieval-only sanity check
        # that never paid for the judge.
        with tracked_run(
            "+".join(sections) or "empty",
            params={
                "sections": ",".join(sections),
                "rerank": rerank,
                "judge_runs": args.judge_runs if want_judge else None,
                "courtroom_limit": args.courtroom_limit,
                "corpus_size": index.size,
                "corpus_embedded": index.embedded_count,
            },
        ) as recorder:
            print(f"corpus: {index.size} provisions, {index.embedded_count} embedded")

            if want_retrieval:
                with track() as ledger:
                    results = await evaluate_retrieval(rerank=rerank)
                print_retrieval(
                    results, "reranked (LLM)" if rerank else "fusion only (RRF)"
                )
                recorder.metrics("retrieval", summarise_retrieval(results))
                _spend("retrieval", ledger, recorder)

            if want_judge:
                with track() as ledger:
                    judge_results = await evaluate_judge(args.judge_runs)
                print_judge(judge_results, args.judge_runs)
                recorder.metrics("judge", summarise_judge(judge_results))
                _spend("judge", ledger, recorder)

            if want_courtroom:
                # This section meters itself per scenario, so the ledger here
                # would double-count nothing but is redundant — the cost lands
                # via the summary instead.
                court_results = await evaluate_courtroom(limit=args.courtroom_limit)
                print_courtroom(court_results)
                recorder.metrics("courtroom", summarise_courtroom(court_results))
                recorder.metrics(
                    "courtroom",
                    {"cost_usd": sum(r.cost for r in court_results)},
                )

            # Opt-in alongside the courtroom: this drives the witness agent, so
            # it is not part of the fast gate for the same reason the courtroom
            # is not.
            if want_witness:
                with track() as ledger:
                    witness_results = await evaluate_witness()
                print_witness(witness_results)
                recorder.metrics("witness", summarise_witness(witness_results))
                _spend("witness", ledger, recorder)
    finally:
        await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
