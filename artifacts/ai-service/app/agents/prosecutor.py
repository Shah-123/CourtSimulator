"""Opposing counsel: the agent that acts on its own.

Its defining behaviour is the autonomous objection. After every question the
student puts to a witness, opposing counsel decides — without any prompting
from the student or a button press — whether the question is improper and, if
so, interjects on a specific evidentiary ground. This is what turns a scripted
Q&A into an adversarial hearing, and it is only possible because opposing
counsel is a separate agent with its own turn to act, not a persona the judge
puts on.

The agent may only object on a ground whose backing provision exists in the
corpus (the catalogue is resolved from the statute book), so every objection it
raises is citable by construction. It is instructed to stay silent unless the
ground is clear, because an advocate who objects to everything is noise, not
opposition.
"""

from __future__ import annotations

import logging

from app.agents.llm import json_completion, text_completion
from app.agents.state import AgentContext, Objection
from app.config import get_settings

logger = logging.getLogger(__name__)

_SCREEN_SYSTEM = """You are opposing counsel in a Pakistani courtroom, listening to the question the student's counsel has just put to a witness. Your job right now is narrow: decide whether that single question is objectionable on one of the recognised evidentiary grounds below, and if so, rise to object.

Be disciplined. Real advocates do not object to every question — object only when a specific ground clearly applies to THIS question. When in doubt, stay silent and let the examination continue. You may object on at most one ground.

Consider the phase:
- In examination-in-chief (direct), a party may not lead its own witness on contested matters — a question that suggests its own answer is objectionable as leading.
- In cross-examination, leading is permitted; watch instead for questions that are irrelevant, argumentative, insulting, assume unproved facts, or misuse a document or a police statement.

Apply this test before calling anything leading. A question is leading only if it puts the desired answer into the witness's mouth — a proposition with "didn't you?", "isn't it?", "correct?" or "is that not so?" attached, or one that states a contested fact and invites agreement. Questions that open with what, where, when, who, why, how, or "describe"/"tell the court" are NOT leading, however central the subject, because they leave the answer entirely to the witness. Never object merely because the answer will be important.

Available grounds (you may cite only these):
{grounds}

Respond with strict JSON only:
{{"object": boolean, "groundId": string or null, "interjection": string, "reason": string}}
- "groundId" must be one of the ids above, or null if you are not objecting.
- "interjection" is what you say aloud, in the register of a Pakistani advocate, one or two sentences beginning with "Objection, My Lord" — empty string if not objecting.
- "reason" is a short private note on why (not spoken)."""


def _render_grounds(context: AgentContext) -> str:
    return "\n".join(
        f"- {ground.id}: {ground.label} ({ground.citation}) — {ground.description}"
        for ground in context.grounds
    )


async def screen_for_objection(context: AgentContext) -> Objection | None:
    """Decides whether to object to the student's last question, autonomously.

    Runs as a cascade when ``objection_cascade`` is on. The screen fires after
    every single question put to a witness and the honest answer to most of them
    is "no objection" — that majority does not need a frontier model. The cheap
    model disposes of it; anything it wants to object to is re-decided by the
    strong model before the student hears it, because an objection is the part
    of this that teaches a rule, and teaching a wrong one is the expensive
    failure. The saving therefore comes entirely from the silent turns.
    """
    if not context.grounds:
        return None

    settings = get_settings()
    system = _SCREEN_SYSTEM.format(grounds=_render_grounds(context))
    witness = context.active_witness
    user = (
        f"{context.case_context()}\n\n"
        f"Witness on the stand: {witness.name if witness else 'unknown'}"
        f"{f' ({witness.role})' if witness and witness.role else ''}.\n\n"
        f"Recent exchange in this phase:\n{context.working_memory_text()}\n\n"
        f'The student has just asked the witness:\n"{context.utterance}"\n\n'
        "Decide whether to object to that question."
    )

    if settings.objection_cascade:
        screened = await json_completion(
            system, user, max_tokens=400, model=settings.model_fast
        )
        if not screened.get("object"):
            return None
        logger.info("Cheap screen proposes an objection; escalating to confirm")

    payload = await json_completion(system, user, max_tokens=400)

    if not payload.get("object"):
        return None

    ground_id = payload.get("groundId")
    ground = next((g for g in context.grounds if g.id == ground_id), None)
    if ground is None:
        # Model wanted to object but named no valid ground: treat as no
        # objection rather than raise one we cannot cite.
        logger.info("Objection discarded: unknown ground %r", ground_id)
        return None

    interjection = (payload.get("interjection") or "").strip()
    if not interjection:
        interjection = f"Objection, My Lord — {ground.label.lower()}."

    logger.info(
        "Opposing counsel objects: ground=%s (%s)", ground.id, ground.citation
    )
    return Objection(
        ground_id=ground.id,
        label=ground.label,
        citation=ground.citation,
        heading=ground.heading,
        content=ground.content,
        interjection=interjection,
    )


_ARGUE_SYSTEM = """You are opposing counsel representing the other side in a Pakistani court, rebutting the student's argument during cross-examination. Speak as a sharp, professional advocate: challenge the student's reasoning, press a counterpoint grounded in the applicable law, and — this matters — if the student now asserts something that contradicts what they told this court earlier, confront them with it directly and quote what they said before. Keep it to 2-4 sentences, combative but professional. Stay in character; never mention being an AI."""


async def argue(context: AgentContext) -> str:
    """Opposing counsel's spoken rebuttal (cross-examination, no witness up)."""
    system = _ARGUE_SYSTEM
    if context.memory_prompt:
        system = f"{system}\n\n{context.memory_prompt}"
    user = (
        f"{context.case_context()}\n\n"
        f"Exchange so far in this phase:\n{context.working_memory_text()}\n\n"
        f'The student just argued:\n"{context.utterance}"\n\n'
        "Rebut as opposing counsel."
    )
    return await text_completion(system, user, max_tokens=300)
