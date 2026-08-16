"""The witness: decides what it can properly say, then says it.

A witness is the one agent in this courtroom with no tools, and that is a legal
constraint rather than an omission. A witness testifies to their own perception.
Giving them a search tool would let them testify to things they looked up, which
is the opposite of what a witness is for — and the material they *are* entitled
to draw on (their statement of record, and what they have already sworn to this
session) is handed to them in the prompt, so a tool over it would fetch nothing
it does not already hold.

Their agency is therefore not retrieval. It is the decision every real witness
makes under examination: *can I properly say this?* Counsel will ask questions
whose answers are not in the witness's knowledge, questions that invite a legal
conclusion, and questions that quietly presuppose a fact the witness never gave.
A witness who answers all of them fluently is not a good witness — it is a
fabrication engine wearing a name, and it teaches a student that any question
will produce evidence.

So the model is made to commit to one of four outcomes before it speaks, and to
name what in its own record supports it. A factual assertion with no support in
the statement or in prior testimony is not permitted to be spoken as fact; the
honest answers — *I don't recall*, *that is not something I can say* — are made
first-class rather than left as things a compliant model will never choose.

That basis is returned alongside the words so the bench and the student can see
why the witness answered as it did, the same way the judge's ReAct trace shows
what it read before ruling.
"""

from __future__ import annotations

import logging

from app.agents.llm import json_completion
from app.agents.state import AgentContext, ReasoningStep

logger = logging.getLogger(__name__)

# What the witness is allowed to do with a question. Deliberately small: a
# witness's discretion is narrow, and an open-ended set would let the model
# invent a posture ("object", "confer with counsel") that is not the witness's
# to take.
OUTCOMES = ("answer", "dont_recall", "decline_speculation", "correct_record")

_WITNESS_SYSTEM = """You are {name}, a {role} testifying as a witness in a Pakistani court. You are under oath.

Your statement of record:
"{statement}"

Before you speak, decide what you can properly say. Choose exactly one outcome:

- "answer" — the question asks about something within your own perception, supported by your statement or by testimony you have already given this session. Answer it.
- "dont_recall" — the question asks about something you did not perceive, were not present for, or simply do not remember. Say so plainly. Do NOT construct a plausible answer.
- "decline_speculation" — the question asks you to guess, to state someone else's intention, or to give a legal conclusion (whether a crime was committed, whether conduct was lawful). That is not for a witness to say.
- "correct_record" — the question takes as given a fact you never stated, or contradicts what you already testified to. Correct it before it goes on the record.

The binding rule: every fact you assert aloud must be traceable to your statement or to your own earlier testimony. You are under oath and you are not a party to this case — you have no interest in helping either side. If counsel's question needs a fact you do not have, the truthful answer is that you do not have it. Inventing a detail that fits the question is perjury, not helpfulness.

Speak in the first person, 2-4 sentences, in the register of an ordinary person in a courtroom. Show appropriate nervousness or confidence. Never break character and never mention being an AI.

Respond with strict JSON only:
{{"outcome": one of {outcomes}, "grounding": "statement" | "prior_testimony" | "both" | "none", "basis": string, "spoken": string}}
- "basis" is one short line, not spoken aloud: what in your record supports this, or why you cannot answer.
- "spoken" is what the court hears."""


async def testify(context: AgentContext) -> tuple[str, list[ReasoningStep]]:
    """The witness answering the student's question.

    Returns what is said aloud plus the grounding decision behind it. An empty
    transcript means there is no witness on the stand — the graph treats that as
    "no event", exactly as it did before.
    """
    witness = context.active_witness
    if witness is None:
        return "", []

    system = _WITNESS_SYSTEM.format(
        name=witness.name,
        role=witness.role or "witness",
        statement=witness.statement or "(no prior statement on file)",
        outcomes=", ".join(f'"{o}"' for o in OUTCOMES),
    )
    # The witness-scoped recollection, never the full one: `memory_prompt`
    # carries every witness's evidence and this agent was out of the room for
    # all of it but its own.
    if context.witness_memory_prompt:
        system = f"{system}\n\n{context.witness_memory_prompt}"

    user = (
        f"{context.case_context()}\n\n"
        f"Questions and answers so far in this phase:\n"
        f"{context.working_memory_text()}\n\n"
        f'Counsel now asks you:\n"{context.utterance}"\n\n'
        "Decide what you can properly say, then say it."
    )

    payload = await json_completion(system, user, max_tokens=500)

    spoken = str(payload.get("spoken") or "").strip()
    outcome = str(payload.get("outcome") or "").strip()
    grounding = str(payload.get("grounding") or "").strip()
    basis = str(payload.get("basis") or "").strip()

    if not spoken:
        # The model returned nothing usable. A witness who cannot answer says so
        # rather than the turn silently producing no testimony, which would read
        # to the student as the question having been struck.
        logger.warning("Witness produced no usable answer; falling back")
        return (
            "I am sorry, My Lord — I do not follow the question.",
            [
                ReasoningStep(
                    thought="No usable answer was produced.",
                    action="fallback",
                    observation="witness asked for the question to be repeated",
                )
            ],
        )

    if outcome not in OUTCOMES:
        # Unknown posture: keep the words, drop the claim about why. Better a
        # bare answer than a trace asserting a decision the witness did not make.
        logger.info("Witness returned unknown outcome %r", outcome)
        return spoken, []

    # An assertion the witness cannot trace to their own record is exactly what
    # this agent exists to catch, so it is logged rather than passed over: it
    # means either the model ignored the rule, or the question genuinely had no
    # grounded answer and the outcome should not have been "answer".
    if outcome == "answer" and grounding == "none":
        logger.warning(
            "Witness answered with no grounding in statement or prior testimony: %r",
            basis or spoken[:80],
        )

    return spoken, [
        ReasoningStep(
            thought=basis,
            action=f"{outcome} (grounded in: {grounding or 'unstated'})",
            observation=_OUTCOME_NOTE.get(outcome, ""),
        )
    ]


_OUTCOME_NOTE = {
    "answer": "within the witness's own knowledge",
    "dont_recall": "outside the witness's recollection",
    "decline_speculation": "calls for speculation or a legal conclusion",
    "correct_record": "the question assumed a fact not in evidence",
}
