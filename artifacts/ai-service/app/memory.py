"""Long-term agent memory for a courtroom session.

Agents get two tiers of memory:

* **Working memory** — the turns of the current phase, replayed verbatim.
* **Long-term memory** — a structured recollection of everything before it.

Kept structured rather than as prose because the fields are used individually:
``student_claims`` is what a contradiction check compares a new assertion
against, and flattening it into a narrative would make that comparison lossy.

Summarisation runs on phase transitions, not per turn. Within a phase the agent
already sees the raw turns, so summarising each one would spend a model call to
produce information the agent is not missing. A watermark makes each fold
incremental — four calls per session in total.
"""

from __future__ import annotations

import json
import logging

from pydantic import BaseModel, Field

from app import db
from app.config import get_settings

logger = logging.getLogger(__name__)

# Caps per list. Without these the case file grows unbounded across a long
# session and eventually crowds the actual question out of the context window.
MAX_CLAIMS = 12
MAX_TESTIMONY = 10
MAX_DIRECTIONS = 6


class SessionMemory(BaseModel):
    summary: str = ""
    student_claims: list[str] = Field(default_factory=list, alias="studentClaims")
    witness_testimony: list[str] = Field(
        default_factory=list, alias="witnessTestimony"
    )
    judge_directions: list[str] = Field(
        default_factory=list, alias="judgeDirections"
    )

    model_config = {"populate_by_name": True}

    def truncated(self) -> SessionMemory:
        return SessionMemory(
            summary=self.summary,
            studentClaims=self.student_claims[-MAX_CLAIMS:],
            witnessTestimony=self.witness_testimony[-MAX_TESTIMONY:],
            judgeDirections=self.judge_directions[-MAX_DIRECTIONS:],
        )

    def to_db_json(self) -> str:
        return json.dumps(self.model_dump(by_alias=True))


EMPTY_MEMORY = SessionMemory()

_SYSTEM_PROMPT = """You maintain the running case file for a moot-court session in a Pakistani court. You are given the case file as it stands and the new transcript since it was last updated. Produce the updated case file.

Rules:
- "summary" is a factual narrative of the proceedings so far, 3-6 sentences. Rewrite it to incorporate the new material; do not simply append.
- "studentClaims" are specific factual or legal assertions the student has committed to on the record, each quoted or closely paraphrased so it can later be checked for consistency. Record what the student asserted as true, not questions they asked.
- "witnessTestimony" are the substantive points each witness gave, prefixed with the witness name.
- "judgeDirections" are procedural directions or warnings the bench issued.
- Carry forward existing entries that are still accurate. Do not invent anything not present in the transcript.
- Keep the most legally significant entries if you must drop some.

Respond with strict JSON only:
{"summary": string, "studentClaims": string[], "witnessTestimony": string[], "judgeDirections": string[]}"""


def parse_memory(raw: dict | str | None) -> SessionMemory:
    if not raw:
        return EMPTY_MEMORY
    if isinstance(raw, str):
        raw = json.loads(raw)
    try:
        return SessionMemory.model_validate(raw)
    except Exception:
        logger.warning("Stored session memory did not validate; treating as empty")
        return EMPTY_MEMORY


def _render_turns(rows: list) -> str:
    return "\n".join(
        f"[{row['phase']}] {row['speaker']}"
        f"{f' ({row['witness_name']})' if row['witness_name'] else ''}: "
        f"{row['transcript']}"
        for row in rows
    )


async def refresh_session_memory(session_id: int) -> SessionMemory:
    """Folds turns recorded since the last update into long-term memory.

    Never raises. A failed summarisation leaves the previous memory and
    watermark in place, so the next transition retries the same span rather
    than silently losing it.
    """
    session = await db.fetchrow(
        "SELECT id, memory, memory_through_turn_id FROM sessions WHERE id = $1",
        session_id,
    )
    if session is None:
        raise ValueError(f"Session {session_id} not found")

    existing = parse_memory(session["memory"])
    watermark = session["memory_through_turn_id"]

    if watermark is None:
        rows = await db.fetch(
            "SELECT id, phase, speaker, witness_name, transcript FROM turns "
            "WHERE session_id = $1 ORDER BY id",
            session_id,
        )
    else:
        rows = await db.fetch(
            "SELECT id, phase, speaker, witness_name, transcript FROM turns "
            "WHERE session_id = $1 AND id > $2 ORDER BY id",
            session_id,
            watermark,
        )

    if not rows:
        return existing

    new_watermark = rows[-1]["id"]
    settings = get_settings()

    try:
        from app.rag.embeddings import get_client

        response = await get_client().chat.completions.create(
            model=settings.model_text,
            max_completion_tokens=1500,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        "CASE FILE AS IT STANDS:\n"
                        f"{json.dumps(existing.model_dump(by_alias=True), indent=2)}\n\n"
                        "NEW TRANSCRIPT SINCE LAST UPDATE:\n"
                        f"{_render_turns(rows)}"
                    ),
                },
            ],
        )
        updated = SessionMemory.model_validate_json(
            response.choices[0].message.content or "{}"
        ).truncated()

        await db.execute(
            "UPDATE sessions SET memory = $1::jsonb, memory_through_turn_id = $2 "
            "WHERE id = $3",
            updated.to_db_json(),
            new_watermark,
            session_id,
        )
        return updated
    except Exception:
        logger.exception("Memory refresh failed for session %s", session_id)
        return existing


def format_memory_for_prompt(memory: SessionMemory | None, phase: str) -> str:
    """Renders long-term memory as a system-prompt block.

    This is what gives an agent continuity across phases. Without it the judge
    hearing a closing argument has no idea what was said in the opening, and
    opposing counsel cannot notice the student has changed their story.
    """
    if memory is None or not memory.summary:
        return ""

    parts = [
        "WHAT HAS HAPPENED EARLIER IN THIS SESSION "
        "(you were present for all of it):",
        memory.summary,
    ]

    if memory.student_claims:
        claims = "\n".join(f"- {claim}" for claim in memory.student_claims)
        parts.append(f"\nASSERTIONS COUNSEL HAS ALREADY MADE ON THE RECORD:\n{claims}")
    if memory.witness_testimony:
        testimony = "\n".join(f"- {point}" for point in memory.witness_testimony)
        parts.append(f"\nTESTIMONY ALREADY GIVEN:\n{testimony}")
    if memory.judge_directions:
        directions = "\n".join(f"- {d}" for d in memory.judge_directions)
        parts.append(f"\nDIRECTIONS THE BENCH HAS ISSUED:\n{directions}")

    parts.append(
        f"\nYou are now in the {phase.replace('_', ' ')} phase. Treat everything "
        "above as your own recollection of the proceedings. If counsel now says "
        "something that contradicts an assertion they made earlier, say so "
        "directly and quote what they said before."
    )
    return "\n".join(parts)


async def load_session_memory(session_id: int) -> SessionMemory:
    row = await db.fetchrow("SELECT memory FROM sessions WHERE id = $1", session_id)
    return parse_memory(row["memory"]) if row else EMPTY_MEMORY
