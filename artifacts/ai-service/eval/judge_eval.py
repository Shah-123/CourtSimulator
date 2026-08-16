"""Judge evaluation: is the AI judge reliable, and does it discriminate?

Two questions a scored simulator has to answer about its own grader:

* **Reliability** — score the same transcript several times; how much does the
  overall score wander? A judge whose score swings 30 points between identical
  runs cannot be trusted to grade a student. Reported as the spread across runs,
  with the median as the self-consistent score.
* **Discrimination** — given transcripts of the same case at different quality,
  does the judge rank them correctly? A grader that cannot tell strong advocacy
  from weak is useless however consistent it is.

The set also probes the citation guard: the weak transcript cites provisions that
do not exist, and its citation-accuracy figure should collapse relative to the
strong one.

    python -m eval.judge_eval            # 3 runs per transcript
    python -m eval.judge_eval --runs 5
"""

from __future__ import annotations

import argparse
import asyncio
import json
import statistics
from dataclasses import dataclass, field
from itertools import combinations
from pathlib import Path

from app import db
from app.verdict import score_session

GOLD_PATH = Path(__file__).parent / "datasets" / "judge_transcripts.json"


@dataclass(slots=True)
class TranscriptResult:
    id: str
    tier: str
    expected_rank: int
    overall_scores: list[int] = field(default_factory=list)
    citation_accuracy: list[int | None] = field(default_factory=list)
    failures: int = 0

    @property
    def median_overall(self) -> float:
        return statistics.median(self.overall_scores) if self.overall_scores else 0.0

    @property
    def spread(self) -> int:
        if not self.overall_scores:
            return 0
        return max(self.overall_scores) - min(self.overall_scores)

    @property
    def stdev(self) -> float:
        return statistics.pstdev(self.overall_scores) if len(self.overall_scores) > 1 else 0.0

    @property
    def median_citation_accuracy(self) -> float | None:
        present = [a for a in self.citation_accuracy if a is not None]
        return statistics.median(present) if present else None


async def _score_one(case: dict, transcript: dict, runs: int) -> TranscriptResult:
    result = TranscriptResult(
        id=transcript["id"],
        tier=transcript["tier"],
        expected_rank=transcript["expectedRank"],
    )
    for _ in range(runs):
        try:
            verdict = await score_session(
                title=case["title"],
                area_of_law=case["areaOfLaw"],
                summary=case["summary"],
                applicable_laws=case["applicableLaws"],
                student_side=case["studentSide"],
                turns=transcript["turns"],
            )
        except Exception:
            result.failures += 1
            continue
        result.overall_scores.append(verdict["overallScore"])
        result.citation_accuracy.append(verdict["citationAccuracy"])
    return result


async def evaluate_judge(runs: int) -> list[TranscriptResult]:
    gold = json.loads(GOLD_PATH.read_text(encoding="utf-8"))
    case = gold["case"]
    # Sequential on purpose: N identical calls in parallel would only stress rate
    # limits, and reliability is about repetition, not throughput.
    return [await _score_one(case, t, runs) for t in gold["transcripts"]]


def _discrimination(results: list[TranscriptResult]) -> tuple[int, int]:
    """Fraction of transcript pairs the judge ordered as expected.

    For every pair, the transcript with the better expected rank should have the
    higher median overall score. Ties count against the judge.
    """
    concordant = 0
    total = 0
    for a, b in combinations(results, 2):
        better, worse = (a, b) if a.expected_rank < b.expected_rank else (b, a)
        total += 1
        if better.median_overall > worse.median_overall:
            concordant += 1
    return concordant, total


def summarise(results: list[TranscriptResult]) -> dict[str, float]:
    """The headline figures of one pass, for recording and for comparing runs.

    Reliability is carried as *worst* spread rather than the mean, because the
    claim being defended is that no transcript wanders — an average hides the
    one that does.
    """
    if not results:
        return {}
    concordant, total = _discrimination(results)
    summary: dict[str, float] = {
        "worst_spread": max(r.spread for r in results),
        "mean_stdev": statistics.mean([r.stdev for r in results]),
        "discrimination": concordant / total if total else 0.0,
        "failures": sum(r.failures for r in results),
    }

    strong = next((r for r in results if r.tier == "strong"), None)
    weak = next((r for r in results if r.tier == "weak"), None)
    if strong and weak and strong.overall_scores and weak.overall_scores:
        summary["strong_weak_gap"] = strong.median_overall - weak.median_overall
        for label, r in (("strong", strong), ("weak", weak)):
            summary[f"{label}_overall"] = r.median_overall
            accuracy = r.median_citation_accuracy
            if accuracy is not None:
                summary[f"{label}_citation_accuracy"] = accuracy
    return summary


def print_report(results: list[TranscriptResult], runs: int) -> None:
    print(f"\n=== Judge eval · {runs} runs per transcript ===\n")
    print(f"  {'transcript':<10} {'median':>7} {'spread':>7} {'stdev':>6} {'cite%':>6}  runs")
    for r in sorted(results, key=lambda x: x.expected_rank):
        cite = r.median_citation_accuracy
        cite_s = f"{cite:.0f}" if cite is not None else "-"
        note = f"  ({r.failures} failed)" if r.failures else ""
        print(
            f"  {r.id:<10} {r.median_overall:>7.0f} {r.spread:>7} "
            f"{r.stdev:>6.1f} {cite_s:>6}  {len(r.overall_scores)}{note}"
        )

    concordant, total = _discrimination(results)
    print(f"\n  reliability: worst spread across runs = "
          f"{max((r.spread for r in results), default=0)} points, "
          f"mean stdev = {statistics.mean([r.stdev for r in results]):.1f}")
    print(f"  discrimination: {concordant}/{total} transcript pairs ranked as expected")

    ordered = sorted(results, key=lambda x: x.median_overall, reverse=True)
    print("  observed ranking (best to worst): "
          + " > ".join(f"{r.id}({r.median_overall:.0f})" for r in ordered))

    strong = next((r for r in results if r.tier == "strong"), None)
    weak = next((r for r in results if r.tier == "weak"), None)
    if strong and weak and strong.overall_scores and weak.overall_scores:
        print(f"  strong-weak gap: {strong.median_overall - weak.median_overall:.0f} points")
        cs, cw = strong.median_citation_accuracy, weak.median_citation_accuracy
        if cs is not None and cw is not None:
            print(f"  citation accuracy: strong {cs:.0f}% vs weak {cw:.0f}%")


async def main() -> None:
    parser = argparse.ArgumentParser(description="AI judge evaluation")
    parser.add_argument("--runs", type=int, default=3, help="runs per transcript")
    args = parser.parse_args()

    await db.init_pool()
    try:
        results = await evaluate_judge(args.runs)
        print_report(results, args.runs)
    finally:
        await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
