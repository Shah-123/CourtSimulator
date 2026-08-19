# Voice demo — hearing the bench, opposing counsel and a witness

A run of *State v. Bilal Hussain* in which all three synthesized voices speak,
in an order that makes the multi-agent graph audible rather than merely
described.

There is one voice per agent
([`voice.ts`](../artifacts/api-server/src/lib/voice.ts)), and the student's own
words are never synthesized — you are counsel, so you speak for yourself:

| Who | Voice | When you hear it |
| --- | --- | --- |
| **The bench** | `onyx` | Presiding over an opening or closing, and ruling on every objection |
| **Opposing counsel** | `echo` | Objecting during examination, and arguing back in cross |
| **The witness** | `shimmer` | Answering a question no objection struck out |

Which advocate the `echo` voice *is* depends on the side you pick. Argue for
**The State** and it is defence counsel for Bilal Hussain; argue for **Bilal
Hussain** and it is the prosecutor. The case is built to work either way — this
script takes the State, because the prosecution examines first.

---

## The case

**State v. Bilal Hussain** — criminal, advanced, seeded from
[`scripts/seed.mjs`](../scripts/seed.mjs). Find it by title; ids differ between
databases. It is the only library case carrying a full brief, so it opens with a
court, a case number, seven numbered facts, five lettered grounds and a prayer.

> Asim Javed, who managed the Al-Barq filling station on Adiala Road,
> Rawalpindi, was shot dead in the station's cabin at about 9:40 pm on 14 March
> 2025. The prosecution says the assailant was Bilal Hussain, a pump attendant
> dismissed three weeks earlier over a cash shortfall. The defence pleads alibi
> at a family function in Chakwal, ninety kilometres away, and attacks the proof
> rather than the story.

**Witnesses** — three for the prosecution, one for the defence, so whichever
side you take you have someone to examine in chief *and* someone to cross:

| Witness | Role | Whose |
| --- | --- | --- |
| **Nadia Sattar** | Cashier at the filling station (eyewitness) | Prosecution |
| **Inspector Rehan Qureshi** | Investigating Officer | Prosecution |
| **Dr. Ayesha Malik** | Medico-legal Officer | Prosecution |
| **Junaid Farooq** | Cousin of the accused (alibi witness) | Defence |

Three facts in the file are load-bearing for the demo, and each one is what
makes a beat below fire on the law rather than on a phrase:

- Nadia Sattar **was told** about the second man on the motorcycle. She did not
  see him. Asking her about him is genuinely hearsay.
- The station's recorder **would not read**, so the footage exists only as a
  copy on a USB drive. Putting that copy to a witness is genuinely secondary
  evidence.
- Her statement to the police **does not name the accused**. The identification
  first appears five days later, after the arrest.

---

## Before you start

Three services, then seed:

```bash
pnpm run dev:ai
```

```bash
pnpm run dev:api
```

```bash
pnpm run dev
```

```bash
pnpm run db:seed
```

Open the case library, review **State v. Bilal Hussain**, choose to argue as
the **petitioner** (The State), and start the session. Allow the microphone.

> The first turn of the day is slow: importing LangGraph costs about 49
> seconds, once, on the first request that builds the graph. Put a throwaway
> line through the courtroom before an audience is watching.

---

## The run

Nine beats. The four marked **★** are the ones that have to happen for every
voice to be heard; the rest are what make it a hearing rather than a demo reel.

### 1 ★ Opening — the bench speaks

Phase: **opening**. No witness. Say:

> "My Lord, the prosecution will show that on the night of 14 March 2025 the
> accused shot Asim Javed dead in the cabin of the Al-Barq filling station, and
> was seen walking out of it with the pistol still in his hand."

**Hear:** the **judge** (`onyx`), one line, no objection — an opening is
addressed to the court and nobody may interrupt it.

Verified reply: *"Learned counsel… How do you plan to address the fact that the
initial statement recorded under CrPC section 161 does not name the accused?"*

Worth pausing on. Nothing in that utterance mentioned the police statement — the
bench pulled it out of the brief's **ground E** and pressed the weakest point in
the prosecution case with it. That is the difference a pleaded brief makes.

### 2 ★ Examination-in-chief — the witness answers

Advance to **witness examination** and call **Nadia Sattar** to the stand. Say:

> "Ms. Sattar, what did you see when you looked up from the cash counter that
> night?"

**Hear:** the **witness** (`shimmer`). No objection — the supervisor routed
straight past opposing counsel to the witness box.

Open the reasoning on her answer: outcome `answer`, grounded in `statement`.
She is telling the court what she saw because it is in her record.

### 3 ★ Lead her, and lose the answer

Same witness. Say:

> "Ms. Sattar, you saw Bilal Hussain walk out of that cabin with the pistol
> still in his hand, didn't you?"

**Hear, in this order:** **opposing counsel** (`echo`) objecting, then the
**judge** (`onyx`) ruling — and then nothing. **Sustained, so the witness never
answers.**

That silence is the whole point of the graph: three agents acting in sequence on
one question, with the routing after a sustained objection asserted in code
rather than left to a model's discretion.

Verified: *leading question*, **QSO 1984 Art. 137**, sustained, with the bench's
ReAct trace showing `search_statute("leading questions in examination-in-chief")`
returning Arts. 137, 136, 133 and 138 — the rule, the definition, and the
exception, read before the ruling.

### 4 Hearsay — the fact she was told

Same witness. Say:

> "Ms. Sattar, what did the other staff tell you about the man waiting on the
> motorcycle?"

**Hear:** objection — *hearsay*, **QSO 1984 Art. 71** — then sustained.

This one is not a form trap. Her statement says the motorcyclist is something
she was told, so the question asks for exactly what Art. 71 excludes.

### 5 A copy where the original is required

Call **Inspector Rehan Qureshi**. First establish the position with an open
question:

> "Inspector, I am placing before you this USB drive said to hold the station's
> footage of that night. Tell the court what it is and how it came to be made."

**Hear:** the **witness** answers — the disk would not read at the laboratory,
so the station's own operator made the copy. Then tender it:

> "Inspector, look at this USB copy and confirm for the court that the man
> entering the cabin on it is the accused."

**Hear:** objection — *secondary evidence without foundation*, **QSO 1984
Art. 75** — then sustained, the bench pointing counsel at **Art. 76** as the
door they have to open first.

Running these two lines back to back is the strongest pair in the script after
beat 3: the witness lays the foundation problem out loud, and counsel is on
their feet the moment you try to walk past it.

### 6 A question a witness cannot answer

Call **Dr. Ayesha Malik**. Say:

> "Doctor, from the wounds you examined, was the deceased facing the person who
> shot him?"

**Hear:** the **witness** — *"I can't say for sure."* Outcome
`decline_speculation`.

No objection, no ruling, and no invented answer either. This is the honesty
machinery inside the witness agent rather than around it: a question with no
answer in her record produces a refusal, not a plausible sentence.

### 7 ★ Cross-examination — opposing counsel argues

Advance to **cross examination**. Put **no witness** on the stand, and address
the bench:

> "My Lord, the defence's plea of alibi rests on a single cousin of the accused
> and on no independent proof at all, and it was never put to the investigating
> officer during the investigation."

**Hear:** **opposing counsel** (`echo`) at length — this is the beat where you
hear the other advocate *arguing* rather than interrupting.

Verified reply: defence counsel answered that a single witness is competent
under **QSO 1984 Art. 17**, that the defence is not bound to disclose an alibi
during investigation, and then turned the file back on the prosecution —
*"How do you explain Nadia's failure to name the accused in her initial
statement?"*

### 8 Leading is now proper

Call **Junaid Farooq** — the defence's witness, so in cross. Say:

> "Mr. Farooq, you are the accused's first cousin, are you not?"

**Hear:** the **witness**. **No objection.** The identical grammatical form that
was struck out in beat 3 is proper here, because Art. 137 governs
examination-in-chief and this is cross.

Beats 3 and 8 back to back are the clearest proof the system knows the rule
rather than pattern-matching *"didn't you?"*.

### 9 Push it too far

Same witness. Say:

> "You would say absolutely anything to keep your cousin off the gallows,
> wouldn't you?"

**Hear:** objection — *questions intended to insult or annoy*, **QSO 1984
Art. 148** — then sustained.

Art. 148, not 143. The corpus originally filed this rule under 143, which is a
different provision; it was caught by diffing against the official text.

### Then close and take the verdict

Advance to **closing**, make your submission (the bench answers), then advance
to **verdict** for the scorecard and the citation-accuracy figure.

---

## Without the browser

Every beat also runs through the read-only simulator, which prints the agent
trace instead of speaking it — useful for rehearsing, and for checking the case
still behaves after a change:

```bash
pnpm run simulate-courtroom <sessionId> --phase witness_examination --witness "Nadia Sattar" "Ms. Sattar, what did you see when you looked up from the cash counter that night?"
```

It persists nothing, so it is safe to run repeatedly.

---

## What was actually verified, and what was not

Every beat above was driven through the live courtroom graph on 2026-08-19 with
`simulate-courtroom`, and the quoted replies are what it printed. Routing,
grounds, rulings and citation audits all came back as written: **audit 100%
verified, 0 fabricated** on every beat that cited law.

**Nobody has heard this case out loud.** There is no audio device in the
environment these beats were verified in, so synthesis and playback were not
exercised for *State v. Bilal Hussain* at all. What is known about the voice
path is what
[`docs/agents.md`](../artifacts/ai-service/docs/agents.md#speaking-the-turn)
records for the other case: first audio at 8.1 s, and mic capture plus browser
playback confirmed on 2026-08-17 for an objection and a ruling. A witness
*answering* has still never been listened to by anyone — beat 2 is the shortest
path to fixing that, and it should be run through a microphone and speakers on
the machine you will present from, well before the day.

## What the brief costs

The brief is read into every agent prompt through `case_context()`, and there
are up to four agent calls in a turn (objection screen, ruling, testimony,
bench). Measured on the stored row: the facts, grounds and prayer render to
**3,271 characters — roughly 820 input tokens per agent call**, on top of a
566-character applicable-laws string and an 823-character summary.

That is the price of a bench that can press a student on ground E. It is paid
per turn, so quote it from `pnpm run eval:courtroom`, which prints spend per
section, rather than from an estimate.

No eval baseline moves because of this case: `eval:courtroom` runs against a
fixture case in its own golden dataset, not against the library, and nothing in
retrieval, the prompts, the agents or the scorer changed — only seed data.

## Related

- [`docs/practice-script.md`](practice-script.md) — the same drill on
  *State v. Yasir Alam*, with every line traced back to the 32 scored
  evaluation scenarios.
- [`docs/agents.md`](../artifacts/ai-service/docs/agents.md) — the graph, the
  ReAct judge, and how a turn is spoken.
