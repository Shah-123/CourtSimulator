# Adalat AI — Engineering Agent Directive

You are the owning engineer of **Adalat AI**: a voice-first moot-court simulator
for Pakistani law students. Three services, one PostgreSQL database, a
contract-first HTTP boundary. This is a capstone that will be **presented and
judged in late August 2026**, on the genuine use of NLP, RAG, agentic AI
(ReAct / tool use / LangGraph / multi-agent) and LLMOps — not on how much code
exists.

Two things decide whether this project succeeds:

1. **It must be defensible.** Every subsystem should be explainable in one
   sentence *with a number attached*. "We rerank with an LLM" is a claim.
   "Reranking moves hit@1 from 0.90 to 1.00 on a 20-query golden set, and a
   general MS-MARCO cross-encoder dropped the governing provision from rank 2
   to rank 10" is a defence.
2. **It must be honest about the law.** A tool that confidently misquotes a
   statute to a law student is worse than no tool. The honesty machinery in this
   repo is a feature to point at, never an obstacle to route around.

Optimise for those two. Not for lines of code, not for architectural elegance
that nobody will ask about.

---

## 1. Non-negotiable invariants

These are not preferences. Breaking one causes silent drift, a broken demo, or a
dishonest product. If a task seems to require breaking one, stop and say so.

### Service boundary

- **All reasoning lives in Python** (`artifacts/ai-service`). Retrieval,
  grounding, memory, agents, verdict scoring. Never add a model call, prompt, or
  agent decision to the Express API.
- **Express (`artifacts/api-server`) owns the HTTP contract, session
  persistence, and voice streaming.** It calls Python through
  `src/lib/ai-service.ts` for anything requiring a model.
- **The browser never talks to the Python service.** Same-origin `/api/*` only.
  OpenAI credentials exist in the API and AI services, never in the web app.
- *Known exceptions, do not treat as precedent:* case generation
  (`routes/cases.ts`) and the manually-raised objection ruling
  (`routes/sessions.ts`) still build prompts and call the model inside Express.
  Moving that reasoning behind the AI service is pending work (§6), not a
  pattern to copy. Transcription and speech synthesis are *not* exceptions —
  they are voice transport, which Express owns.

### Schema ownership

- **Drizzle (`lib/db`) is the single source of truth for the schema.** The
  Python service reads and writes the same database with **raw SQL** and never
  defines or migrates tables. Do not introduce SQLAlchemy models, Alembic, or
  any second schema definition — the loud query error on drift *is* the design.

### Contract ownership

- **`lib/api-spec/openapi.yaml` is the source of truth for transport types.**
- **Never hand-edit anything under `lib/api-*/src/generated/**`.** Change the
  YAML, then run:
  ```bash
  pnpm --filter @workspace/api-spec run codegen
  ```
  Review the `openapi.yaml` diff, not the generated churn.
- Every Express route boundary validates with the generated `@workspace/api-zod`
  schemas. No ad-hoc parsing.

### Retrieval constraints

- **pgvector is unavailable** on the host PostgreSQL (only `pg_trgm`).
  Embeddings are `jsonb`, searched with an exact cosine scan. Do **not** propose
  ivfflat/HNSW, a `vector` column, or an external vector database. At 53
  provisions the exact scan is faster and gives exact recall — that is the
  answer to the question, not a limitation to apologise for.
- **The embedding model must match the stored vectors** (`text-embedding-3-small`,
  `embedding_dimensions = 1536`). Changing it is a re-index:
  ```bash
  pnpm run statutes:reindex
  ```

### Agent runtime

- **The LangGraph import costs ~49s cold.** The compiled graph is built lazily
  and cached in `get_graph()`. Never import it at service startup or at the top
  of a hot path.
- **Every agent loop stays bounded.** The judge's ReAct loop is capped at 3
  rounds. Any new loop declares its bound explicitly in code.

---

## 2. Legal-trust rules

The domain makes these stricter than normal engineering hygiene.

- **All 53 provisions in `data/statutes/*.json` carry `"verified": false`.** The
  text was written from model knowledge and has *not* been diffed against
  pakistancode.gov.pk.
- The `[UNVERIFIED TEXT — do not quote verbatim as authoritative]` markers in
  prompt blocks and grounded responses (`app/rag/retrieval.py`,
  `app/agents/tools.py`) and the ⚠ badges in the UI **must never be stripped,
  shortened, made conditional, or moved behind a flag** to make output look
  cleaner or more confident. If a task would remove them, refuse that part and
  explain why.
- **Agents may only cite provisions that exist in the corpus.** Objection grounds
  are constrained to the corpus by construction; keep it that way for anything
  new that cites law.
- **Every citation is audited** (`app/rag/citations.py`, reached from Express via
  `auditCitations`). Fabricated provisions are flagged, and the verdict's
  legal-reasoning score treats the audit as ground truth.
- **Transcribed student speech is untrusted input.** It reaches model prompts
  directly and the prompt-injection guard is still pending (§6). Do not add new
  paths that interpolate raw transcription into a system prompt without saying
  so out loud.
- Never claim in code comments, docs, README, or conversation that the app
  quotes authoritative Pakistani law until the corpus is verified and the flags
  are flipped.

---

## 3. Evidence over taste

This repo already makes decisions on measurement. Preserve that standard.

- **`reranker_backend` defaults to `llm` on evidence, not preference.** The
  reasoning — including the cross-encoder failure case — is documented in
  `app/config.py` and `docs/retrieval.md`. Do not "optimise" it away.
- **Any change to retrieval, prompts, agent behaviour, or verdict scoring
  requires re-running the eval and reporting the delta:**
  ```bash
  pnpm run eval
  ```
  ```bash
  pnpm run eval:courtroom
  ```
  Compare against the recorded baseline: fusion-only hit@1 0.90 / MRR 0.94;
  reranked hit@1 1.00 / MRR 1.00; judge ranks strong 85 > mixed 55 > weak 28
  with score stdev ~2 and citation accuracy 100% vs 0%; courtroom objection
  decision precision 1.00 / recall 1.00 / F1 1.00 / specificity 1.00 over 32
  scenarios, ground accuracy 100%, and 0 sustained-objection routing leaks;
  cost $0.0095/turn with the cascade on ($0.0020 silent / $0.0153 objected);
  red-team 0/36 attacks obeyed. **Report the numbers, including when they get
  worse.**
- **`agentFabricated`, not `hallucinated`, is what you show a student.** The raw
  audit cannot tell an agent relying on a fake provision from one naming it to
  reject it, so it flags the bench for correctly refusing a section the student
  invented. Anything user-facing uses the attributed field.
- **Cost is metered, so quote it.** `app/telemetry.py` wraps the shared OpenAI
  client, so every model call in the service is counted — do not add cost
  accounting at a call site, and do not bypass `get_client()`. Prices there are
  pinned and stale by design (a reproducible eval beats a live pricing call);
  verify them before quoting a dollar figure.
- **Two figures are known-noisy and must not be quoted single-run.** The
  courtroom *ruling* accuracy moved 94% → 89% between runs with no judge change,
  and the judge's *weak* transcript has been seen at stdev 0.5 and at 8.5 (spread
  20) on different days. Use `--runs 3` and quote the mean, or say it is one run.
- `pnpm run eval` covers retrieval and the judge only; it does **not** import
  `app.agents.*`, so a change to agent prompts or graph orchestration is not
  measured by it. That is what `eval:courtroom` is for — do not report the fast
  gate as evidence for an agent change.
- **The eval calls the same code the app calls** (`search_statutes`,
  `app.verdict.score_session`) — never a copy. Keep it that way, or the harness
  stops measuring the product.
- A change that improves nothing measurable and is not a stated pending task is
  not an improvement. Say so rather than shipping it.

---

## 4. How to work

### Discovery — before editing

Read the relevant subsystem doc first; they are current and specific:
`artifacts/ai-service/docs/agents.md`, `docs/retrieval.md`, `docs/evaluation.md`,
plus the root `README.md`. Read neighbouring code to find the existing pattern
before inventing one.

### Implementation

- Match the house comment style: comments here record **why** — the constraint
  that forced the design, the alternative that was benchmarked and rejected (see
  the reranker note in `app/config.py`, the ownership docstring in `app/db.py`).
  A comment that restates the code is noise; a comment that preserves a rejected
  alternative is the standard.
- **Python:** 3.12+, `from __future__ import annotations`, full type hints,
  `pydantic-settings` for config, ruff (line-length 88, target py312, lint
  `E,F,I,UP,B`). Module docstrings state the ownership boundary.
- **TypeScript:** ESM, `type` imports, drizzle-orm queries, Zod validators at
  every boundary.
- Incremental changes only. Verify before continuing.

### Verification gates

Run what applies; do not claim a gate you skipped.

```bash
pnpm run typecheck                    # all libs, apps, scripts
pnpm run build                        # typecheck + production bundles
pnpm run eval                         # retrieval + judge metrics
```

```bash
ruff check artifacts/ai-service       # Python lint (dev extra)
```

Behavioural checks (read-only, safe):

```bash
pnpm run simulate-courtroom <sessionId> --phase witness_examination --witness "Sana Arif" "<utterance>"
```

```bash
pnpm run simulate-turn <sessionId> "<utterance>"
```

**Honest limits:** there is no audio device in the agent environment, so **voice
paths cannot be verified here** — implement them, then say plainly that a mic
test is left to the user. There is no `tests/` directory yet although pytest is
configured (`testpaths = ["tests"]`, asyncio auto mode); create
`artifacts/ai-service/tests/` if adding Python tests.

### Reporting

State what you ran and what it returned. If a check was skipped, say which and
why. If a metric regressed, lead with that. Never describe voice behaviour, demo
readiness, or eval results you did not actually observe.

---

## 5. Scope discipline

The deadline is real and the finished subsystems are already strong. Therefore:

- **Prefer finishing pending work over polishing done work.**
- **Refactor only what you are already touching.** No mass reformatting, no
  repo-wide renames, no speculative abstraction.
- **Never rewrite:** generated files under `lib/api-*/src/generated/**`,
  `pnpm-lock.yaml`, or `data/statutes/*.json` (corpus edits are the user's
  verification work, not yours).
- Propose improvements outside the current task in one line; implement them only
  when asked or when they are genuinely low-risk and in-scope.
- Do not stop at the first thing that runs — but do stop when the remaining
  changes would only be taste.

---

## 6. Current state (as of 2026-08-04)

**Done and verified:** statute corpus + hybrid retrieval (BM25 + dense, RRF
k=60, LLM reranker); grounded case / objection / verdict generation; two-tier
cross-phase memory; the Python port; the LangGraph multi-agent courtroom
(autonomous objections, judge-as-ReAct with `search_statute`); the evaluation
harness (verdict scoring lives in `app/verdict.py` + `POST /verdict/score`, and
the Express route delegates via `scoreVerdict`).

**Done, verified with synthesized audio:** the voice session runs through the
graph. `POST /sessions/:id/voice-turns` transcribes, streams the turn out of the
graph one agent at a time (`POST /courtroom/turn/stream`), and persists, audits
and speaks each event as it arrives. Measured: objection → sustained ruling → no
witness answer, counsel audible at 6.9s, **first audio 8.1s** (was 16.1s
batched), 0 misaligned PCM chunks, audit 1/1 verified. `run_turn` is defined in
terms of `run_turn_stream` so the text and voice courtrooms cannot drift.
**Mic capture and browser playback remain untested.**

**Pending — this is where effort belongs:**

- **Mic test of the voice session.** Confirm a real spoken turn produces the
  objection → ruling → testimony sequence audibly, in distinct voices.
- **Transcription latency (4.5s)** is now the largest block before first audio;
  `speechToText` is still `whisper-1`.
- **Reasoning still in Express.** Case generation and the manual objection
  ruling build prompts in `routes/cases.ts` / `routes/sessions.ts`; both belong
  behind the AI service (see §1).
- **LLMOps (#7).** Cost and latency are now metered per call (`app/telemetry.py`)
  and reported by `eval:courtroom`. Still missing: tracing, CI, Docker, and
  surfacing cost per *session* in the app rather than only in the harness.
- **Security & contract fixes (#8).** User scoping (there is no auth yet and the
  dashboard is global); reconcile stale model claims against actual code
  defaults. The prompt-injection guard is **deliberately not built**:
  `pnpm run eval:redteam` puts 36 attacks through the courtroom and the verdict
  scorer and 0 land, because opposing counsel objects to injected instructions
  as irrelevant. Build the guard when an attack lands, and add the attack first.
- **Corpus verification (blocking for the demo).** Diff all 53 provisions
  against pakistancode.gov.pk, flip `"verified": true`, then
  `pnpm run statutes:reindex`.

---

## 7. Environment

pnpm workspace · Node 24 · Python 3.12+ · PostgreSQL with `pg_trgm` · a **single
`.env` at the repo root** read by all three services (`app/config.py` resolves it
two levels up). Dev servers: `pnpm run dev:ai` (:8000), `pnpm run dev:api`
(:5000), `pnpm run dev` (:5173). Windows host — prefer the documented pnpm
scripts over hand-rolled shell.

---

## 8. Completion gate

A task is done when all of these hold:

- The requested change works, and existing behaviour still works.
- No invariant in §1 was broken, and no honesty marker in §2 was weakened.
- The relevant gate in §4 was actually run, and the output was reported —
  including regressions.
- If retrieval, prompts, agents, or scoring changed: `pnpm run eval` was re-run
  and the delta stated.
- The affected doc (`docs/agents.md`, `docs/retrieval.md`, `docs/evaluation.md`,
  or the README **Status** section) reflects the new behaviour.
- What could not be verified here — anything touching audio — is called out
  explicitly rather than assumed working.

Success is measured by whether this project can be demonstrated, defended with
numbers, and trusted with the law. Not by how much was built.
