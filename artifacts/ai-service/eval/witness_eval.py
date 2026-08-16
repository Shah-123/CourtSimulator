"""Witness evaluation: does it answer only from its own knowledge?

The courtroom eval measures the two decisions a student *argues against*. This
measures the one they are least equipped to catch. A student can tell when the
bench rules oddly, because the ruling cites a provision they can go and read. A
witness who invents a plausible detail is invisible: it sounds exactly like a
witness who remembers one, and the student has no way to check it against a
statement they have skimmed once.

So the thing worth counting is not whether the witness sounds convincing. It is
how often it manufactures evidence.

The metric is structural rather than judged. Each question is put to a witness
whose statement of record is fixed, and the scenarios are labelled by what that
statement does and does not contain. A question about something the statement
cannot support, answered with ``outcome == "answer"``, *is* the fabrication —
the witness has asserted as perceived fact something it could not have
perceived. No second model is needed to decide that, which keeps the number
cheap, reproducible, and free of a grader's opinion.

This drives ``app.agents.witness.testify`` — the function the graph node calls —
so the harness cannot drift from the product.

    python -m eval.witness_eval
    python -m eval.witness_eval --runs 3
"""

from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import time
from dataclasses import dataclass
from pathlib import Path

from app.agents.state import AgentContext, TurnRequest
from app.agents.witness import testify
from app.telemetry import track
from eval.tracking import tracked_run

GOLD_PATH = Path(__file__).parent / "datasets" / "witness_scenarios.json"

# Groups where answering at all means the witness invented something. Kept
# explicit rather than inferred from `expectedOutcomes`, because one
# outside-knowledge scenario legitimately allows "answer" and lumping it in
# would quietly inflate the fabrication rate.
FABRICATION_GROUPS = ("outside_knowledge", "false_premise")


@dataclass(slots=True)
class WitnessResult:
    id: str
    group: str
    expected: list[str]
    outcome: str = ""
    grounding: str = ""
    spoken: str = ""
    basis: str = ""
    seconds: float = 0.0
    error: str | None = None

    @property
    def outcome_correct(self) -> bool:
        return self.outcome in self.expected

    @property
    def fabricated(self) -> bool:
        """Asserted a perceived fact the statement cannot support."""
        if self.group not in FABRICATION_GROUPS:
            return False
        return self.outcome == "answer" and "answer" not in self.expected

    @property
    def ungrounded_answer(self) -> bool:
        """Answered while admitting nothing in the record backs it."""
        return self.outcome == "answer" and self.grounding == "none"


def _context(case: dict, witness_name: str, utterance: str) -> AgentContext:
    """Builds the same context the graph hands the witness node.

    Memory is left empty on purpose: this measures grounding in the *statement*,
    and seeding prior testimony would let a scenario pass by quoting something
    the harness fed in rather than by declining honestly.
    """
    request = TurnRequest.model_validate(
        {
            "sessionId": 0,
            "phase": "witness_examination",
            "studentSide": case["studentSide"],
            "activeWitness": witness_name,
            "case": case,
            "utterance": utterance,
            "workingMemory": [],
        }
    )
    return AgentContext(request=request, memory_prompt="", grounds=[])


async def _run_scenario(case: dict, witness_name: str, scenario: dict) -> WitnessResult:
    result = WitnessResult(
        id=scenario["id"],
        group=scenario["group"],
        expected=scenario["expectedOutcomes"],
    )

    started = time.perf_counter()
    try:
        spoken, reasoning = await testify(
            _context(case, witness_name, scenario["utterance"])
        )
    except Exception as err:  # a failed scenario is data, not a crash
        result.error = f"{type(err).__name__}: {err}"
        result.seconds = time.perf_counter() - started
        return result

    result.seconds = time.perf_counter() - started
    result.spoken = spoken

    # The decision is carried on the reasoning step the agent returns, as
    # `<outcome> (grounded in: <grounding>)`. Reading it back from there rather
    # than re-calling the model keeps this measuring what the app actually shows
    # the student.
    if reasoning:
        step = reasoning[0]
        result.basis = step.thought
        action = step.action
        result.outcome = action.split(" ", 1)[0] if action else ""
        if "grounded in:" in action:
            result.grounding = action.split("grounded in:", 1)[1].strip(" )")

    return result


async def evaluate_witness(limit: int | None = None, concurrency: int = 4):
    gold = json.loads(GOLD_PATH.read_text(encoding="utf-8"))
    case = gold["case"]
    witness_name = case["witnesses"][0]["name"]
    scenarios = gold["scenarios"][:limit] if limit else gold["scenarios"]

    semaphore = asyncio.Semaphore(concurrency)

    async def bounded(scenario: dict) -> WitnessResult:
        async with semaphore:
            return await _run_scenario(case, witness_name, scenario)

    return await asyncio.gather(*(bounded(s) for s in scenarios))


def summarise(results: list[WitnessResult]) -> dict[str, float]:
    scored = [r for r in results if r.error is None]
    if not scored:
        return {}

    risky = [r for r in scored if r.group in FABRICATION_GROUPS]
    return {
        "outcome_accuracy": sum(r.outcome_correct for r in scored) / len(scored),
        "fabrication_rate": (
            sum(r.fabricated for r in risky) / len(risky) if risky else 0.0
        ),
        "ungrounded_answers": sum(r.ungrounded_answer for r in scored),
    }


def print_report(results: list[WitnessResult]) -> None:
    scored = [r for r in results if r.error is None]
    failed = [r for r in results if r.error is not None]

    print("\n" + "=" * 72)
    print("WITNESS GROUNDING")
    print("=" * 72)

    groups: dict[str, list[WitnessResult]] = {}
    for result in scored:
        groups.setdefault(result.group, []).append(result)

    for group, rows in groups.items():
        correct = sum(r.outcome_correct for r in rows)
        print(f"\n  {group}  ({correct}/{len(rows)} as expected)")
        for r in rows:
            # ASCII only: the sibling evals stay ASCII because a Windows console
            # defaults to cp1252 and dies on an arrow mid-report.
            mark = "ok  " if r.outcome_correct else "MISS"
            flag = "  <-- FABRICATED" if r.fabricated else ""
            print(f"    [{mark}] {r.id:<22} -> {r.outcome or '(none)':<20}{flag}")
            if not r.outcome_correct:
                print(f"           expected one of {r.expected}")
                print(f'           said: "{r.spoken[:96]}"')

    summary = summarise(scored)
    risky = [r for r in scored if r.group in FABRICATION_GROUPS]
    fabricated = [r for r in risky if r.fabricated]

    print("\n" + "-" * 72)
    print(f"  outcome accuracy   {summary.get('outcome_accuracy', 0):.2f}  "
          f"({sum(r.outcome_correct for r in scored)}/{len(scored)})")
    print(f"  fabrication rate   {summary.get('fabrication_rate', 0):.2f}  "
          f"({len(fabricated)}/{len(risky)} questions it could not know)")
    print(f"  ungrounded answers {int(summary.get('ungrounded_answers', 0))}")

    if scored:
        print(f"  median latency     {statistics.median(r.seconds for r in scored):.1f}s")
    if failed:
        print(f"\n  {len(failed)} scenario(s) errored:")
        for r in failed:
            print(f"    {r.id}: {r.error}")


def print_stability(runs: list[dict[str, float]]) -> None:
    """Across-run spread, because one run of a model call is an anecdote."""
    if len(runs) < 2:
        return
    print("\n" + "-" * 72)
    print(f"  across {len(runs)} runs")
    for key in ("outcome_accuracy", "fabrication_rate"):
        values = [r[key] for r in runs if key in r]
        if len(values) < 2:
            continue
        print(
            f"    {key:<18} mean {statistics.mean(values):.2f}  "
            f"min {min(values):.2f}  max {max(values):.2f}"
        )


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument(
        "--runs",
        type=int,
        default=1,
        help="repeat the set; a single run of a model call is an anecdote",
    )
    args = parser.parse_args()

    with tracked_run(
        "witness",
        params={
            "runs": args.runs,
            "limit": args.limit,
            "concurrency": args.concurrency,
        },
    ) as recorder:
        summaries: list[dict[str, float]] = []
        with track() as ledger:
            for run in range(args.runs):
                if args.runs > 1:
                    print(f"\n### run {run + 1} of {args.runs}")
                results = await evaluate_witness(args.limit, args.concurrency)
                print_report(results)
                summaries.append(summarise(results))

        print_stability(summaries)
        print(f"\n  spend: ${ledger.cost:.4f} over {ledger.calls} call(s)")

        # The mean across runs, for the same reason the courtroom records the
        # mean: one run of a model call is an anecdote.
        recorded = {
            key: statistics.mean([s[key] for s in summaries if key in s])
            for key in (summaries[0] if summaries else {})
        }
        recorded["cost_usd"] = ledger.cost
        recorded["calls"] = ledger.calls
        recorder.metrics("witness", recorded)


if __name__ == "__main__":
    asyncio.run(main())
