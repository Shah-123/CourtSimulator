"""The AI judge: scores a completed session transcript.

Reasoning lives in this service, so verdict scoring lives here too rather than in
the Express route — one implementation, called by the API to grade a real session
and by the evaluation harness to measure the judge itself.

The judge is handed the result of auditing every statute the student cited and
told to treat it as ground truth: a citation that does not resolve to a real
provision is a failure of legal reasoning however confident it sounded. That is
what keeps the legal-reasoning score anchored to whether the cited law exists,
not to how plausible it read.
"""

from __future__ import annotations

import json
import logging

from app.config import get_settings
from app.rag.citations import audit_citations, format_audit_for_prompt
from app.rag.embeddings import get_client
from app.rag.retrieval import format_sections_for_prompt, search_statutes

logger = logging.getLogger(__name__)

SIDES = {"petitioner", "respondent"}

# Rounded and clamped before use: models routinely return a weighted average as a
# fraction ("55.75"), and stranding a finished session over a decimal point would
# be absurd. Anything non-numeric falls through and is rejected by validation.
SCORE_FIELDS = (
    "overallScore",
    "legalReasoningScore",
    "persuasivenessScore",
    "procedureScore",
    "factualCommandScore",
)

JUDGE_VERDICT_SYSTEM_PROMPT = """You are a senior Pakistani judge evaluating a law student's performance in a moot-court practice session. You will be given the full transcript of the session (opening, witness examination, cross-examination, closing) and must score the student's performance rigorously but fairly.

You will also be given the provisions that actually govern the case, and the
result of checking every statute the student cited against a statute database.
Treat that check as ground truth. A citation marked DOES NOT EXIST is a serious
failure of legal reasoning however confident the student sounded, and you must
say so explicitly in your remarks. Do not credit a student for engaging with a
provision they invented.

Score each category from 0-100:
- legalReasoningScore: quality and correctness of legal reasoning and citation of applicable law
- persuasivenessScore: clarity, confidence, and persuasive force of argument
- procedureScore: adherence to courtroom procedure and etiquette
- factualCommandScore: command of the facts of the case and witness testimony

Also compute overallScore (0-100, weighted average) and decide winningSide ("petitioner" or "respondent") based on who argued more persuasively and correctly overall.

Respond with strict JSON only, matching this shape:
{
  "winningSide": "petitioner" | "respondent",
  "overallScore": number,
  "legalReasoningScore": number,
  "persuasivenessScore": number,
  "procedureScore": number,
  "factualCommandScore": number,
  "judgeRemarks": string (2-4 sentences in clear, simple, plain English of overall judicial commentary),
  "strengths": string (2-3 sentences in simple, encouraging English on what the student did well),
  "areasForImprovement": string (2-3 sentences in simple, actionable English of constructive feedback)
}"""


def _clamp_score(value: object) -> int | None:
    if isinstance(value, bool):  # bool is an int subclass; reject it explicitly
        return None
    if isinstance(value, (int, float)):
        return max(0, min(100, round(value)))
    return None


def _render_transcript(turns: list[dict]) -> str:
    lines = []
    for turn in turns:
        witness = turn.get("witnessName")
        speaker = turn.get("speaker", "")
        tag = f" ({witness})" if witness else ""
        lines.append(f"[{turn.get('phase', '')}] {speaker}{tag}: {turn.get('transcript', '')}")
    return "\n".join(lines)


def _student_citation_text(turns: list[dict]) -> str:
    return "\n".join(
        turn.get("transcript", "") for turn in turns if turn.get("speaker") == "student"
    )


async def score_session(
    *,
    title: str,
    area_of_law: str,
    summary: str,
    applicable_laws: str,
    student_side: str,
    turns: list[dict],
) -> dict:
    """Grades one session and returns the verdict the API persists.

    Runs the citation audit and provision retrieval the judge reasons over, then
    the scoring call. Raises ValueError if the model's output cannot be trusted
    (a non-numeric score, or a winner that is not a party to this case), so a bad
    verdict is rejected rather than written to the database.
    """
    transcript_text = _render_transcript(turns)

    # Every statute the student cited is checked before scoring; the judge is told
    # the outcome as fact.
    audit = await audit_citations(_student_citation_text(turns))

    # Ground the judge in the provisions the case actually turns on, so it can
    # tell a student who missed the controlling provision from one who engaged
    # with it and lost the argument.
    provisions = await search_statutes(
        f"{title}. {summary} {applicable_laws}", top_k=6, rerank=True
    )

    user = f"""Case: {title}
Student argued as: {student_side}

PROVISIONS GOVERNING THIS CASE:
{format_sections_for_prompt(provisions)}

{format_audit_for_prompt(audit)}

Full session transcript:
{transcript_text or "(No turns were recorded.)"}"""

    settings = get_settings()
    response = await get_client().chat.completions.create(
        model=settings.model_text,
        max_completion_tokens=2048,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": JUDGE_VERDICT_SYSTEM_PROMPT},
            {"role": "user", "content": user},
        ],
    )

    raw = json.loads(response.choices[0].message.content or "{}")

    scores: dict[str, int] = {}
    for field in SCORE_FIELDS:
        clamped = _clamp_score(raw.get(field))
        if clamped is None:
            raise ValueError(f"Verdict field {field!r} was not a number: {raw.get(field)!r}")
        scores[field] = clamped

    winner = raw.get("winningSide")
    if winner not in SIDES:
        raise ValueError(f"Verdict named a side that is not in this case: {winner!r}")

    return {
        "winningSide": winner,
        **scores,
        "judgeRemarks": str(raw.get("judgeRemarks", "")).strip(),
        "strengths": str(raw.get("strengths", "")).strip(),
        "areasForImprovement": str(raw.get("areasForImprovement", "")).strip(),
        "citationAccuracy": audit.accuracy,
        "citationChecks": [
            {
                "raw": check.raw,
                "citation": check.citation,
                "status": str(check.status),
                "heading": check.heading,
            }
            for check in audit.checks
        ],
    }
