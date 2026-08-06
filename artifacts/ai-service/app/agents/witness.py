"""The witness: answers in character, consistent with the record.

A witness is the simplest agent — one in-character response — but it is still a
distinct agent because it must stay consistent with two things a persona-swap
would lose: its own written statement, and the testimony it has already given
earlier in the session. Long-term memory carries the latter across phases, so a
witness cannot be trapped into contradicting itself simply because the earlier
turns have scrolled out of the working-memory window.
"""

from __future__ import annotations

from app.agents.llm import text_completion
from app.agents.state import AgentContext

_WITNESS_SYSTEM = """You are {name}, a {role} testifying as a witness in a Pakistani court. Answer counsel's question as this witness would: in the first person, briefly (2-4 sentences), consistently with your own statement and with anything you have already testified to earlier in this session. Show appropriate nervousness or confidence. Never break character or acknowledge being an AI.

Your statement of record:
"{statement}\""""


async def testify(context: AgentContext) -> str:
    """The witness answering the student's question."""
    witness = context.active_witness
    if witness is None:
        return ""

    system = _WITNESS_SYSTEM.format(
        name=witness.name,
        role=witness.role or "witness",
        statement=witness.statement or "(no prior statement on file)",
    )
    if context.memory_prompt:
        system = f"{system}\n\n{context.memory_prompt}"

    user = (
        f"{context.case_context()}\n\n"
        f"Questions and answers so far in this phase:\n"
        f"{context.working_memory_text()}\n\n"
        f'Counsel now asks you:\n"{context.utterance}"\n\n'
        "Answer as the witness."
    )
    return await text_completion(system, user, max_tokens=250)
