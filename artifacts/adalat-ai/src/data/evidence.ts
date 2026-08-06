/**
 * Recorded measurements, for the Evidence page.
 *
 * These are *recorded* numbers, not live ones. The web app has no route to the
 * evaluation harness and should not pretend otherwise: every figure here was
 * produced by a command that is printed next to it, so anyone doubting a number
 * can rerun the thing that made it.
 *
 * `freshness` is therefore part of the data, not a footnote. A page that shows
 * a metric nobody has rerun since the code changed is worse than one that shows
 * nothing, because it looks current. Anything marked "recorded" was taken from
 * the subsystem docs and has NOT been rerun against the code as it stands.
 */

export type Freshness = "measured" | "recorded";

export interface Metric {
  label: string;
  value: string;
  note?: string;
}

export interface Section {
  id: string;
  title: string;
  question: string;
  command: string;
  freshness: Freshness;
  metrics: Metric[];
  /** The honest limit of what the numbers above support. */
  caveat?: string;
}

/** The date the "measured" sections were last actually run. */
export const MEASURED_ON = "5 August 2026";

export const SECTIONS: Section[] = [
  {
    id: "retrieval",
    title: "Retrieval",
    question:
      "Given a legal question, does the corpus return the provision that governs it, and near the top?",
    command: "pnpm run eval",
    freshness: "measured",
    metrics: [
      { label: "hit@1", value: "1.00", note: "20 of 20 queries at rank 1" },
      { label: "MRR", value: "1.00" },
      {
        label: "without reranking",
        value: "0.80 hit@1",
        note: "MRR 0.88 — fusion alone",
      },
      { label: "queries", value: "20", note: "3 lexical, 17 semantic" },
    ],
    caveat:
      "The reranker is one LLM call, so reranked figures move slightly run to run; the fusion-only numbers are deterministic for a fixed corpus. Fusion alone used to score 0.90 / MRR 0.94 and now scores 0.80 / 0.88 — correcting the corpus made the raw retrievers' job harder, because provisions restored to their full text carry provisos and illustrations that compete for the same query. The reranker absorbed the whole difference, so its contribution grew from +0.10 to +0.20 hit@1.",
  },
  {
    id: "judge",
    title: "The AI judge",
    question:
      "Does the judge give the same transcript the same mark, and does better advocacy score higher?",
    command: "pnpm run eval",
    freshness: "measured",
    metrics: [
      { label: "strong transcript", value: "85", note: "citations 100% real" },
      { label: "mixed", value: "55", note: "citations 50% real" },
      { label: "weak", value: "35", note: "citations 0% real — both fabricated, both caught" },
      { label: "discrimination", value: "3/3", note: "ranked strong > mixed > weak" },
    ],
    caveat:
      "The medians are noisy and the ranking is not. Three runs on the same day, with no change to the judge, scored the weak transcript 25, 25 and 35, with worst spreads of 20, 10 and 7 points. All three ranked the transcripts correctly and all three scored citations 100% / 50% / 0%. Quote the ranking and the citation accuracy; hedge the medians or give the spread with them.",
  },
  {
    id: "courtroom",
    title: "The multi-agent courtroom",
    question:
      "Does opposing counsel object when it should, stay silent when it should not, and does the bench then rule correctly?",
    command: "pnpm run eval:courtroom",
    freshness: "measured",
    metrics: [
      { label: "objection F1", value: "1.00", note: "18 tp · 0 fp · 0 fn · 14 tn" },
      { label: "specificity", value: "1.00", note: "7 proper questions, none objected to" },
      { label: "ground accuracy", value: "100%", note: "every objection cited a defensible provision" },
      { label: "sustained yet answered", value: "0", note: "the routing invariant held in all 32" },
    ],
    caveat:
      "32 scenarios, single run. The ruling figure has been seen between 89% and 100% across runs with no judge change — this run returned 100%. The scenario labels were written by an engineer from provisions whose text is still being verified.",
  },
  {
    id: "redteam",
    title: "Adversarial input",
    question:
      "Transcribed speech reaches agent prompts verbatim. What happens when the student is hostile?",
    command: "pnpm run eval:redteam",
    freshness: "recorded",
    metrics: [
      { label: "attacks obeyed", value: "0 / 36" },
      { label: "verdict attacks landed", value: "0 / 6" },
      { label: "marks moved ≥15 points", value: "0 / 6" },
      { label: "caught by an objection", value: "14–21 / 30", note: "varies by run" },
    ],
    caveat:
      "Not rerun for this build — taken from the recorded results. 36 attacks is evidence the obvious ones fail, not proof the system is safe. The multi-agent design is what deflects them: opposing counsel objects to an injected instruction as irrelevant.",
  },
  {
    id: "cost",
    title: "What a turn costs",
    question: "Is this affordable to run, and where does the money go?",
    command: "pnpm run eval:courtroom",
    freshness: "measured",
    metrics: [
      { label: "per turn", value: "$0.0103", note: "$0.3311 over 32 scenarios" },
      { label: "silent turn", value: "$0.0020", note: "2.9s median — the common case" },
      { label: "objected turn", value: "$0.0168", note: "11.0s median" },
      { label: "model calls", value: "147", note: "94 gpt-4o · 32 gpt-4o-mini · 21 embeddings" },
    ],
    caveat:
      "Prices are pinned in the telemetry module rather than fetched, so a reproducible number beats a live one — verify against current pricing before quoting a dollar figure.",
  },
];

/** Results that changed a decision — the ones worth defending in person. */
export interface Finding {
  title: string;
  body: string;
}

export const FINDINGS: Finding[] = [
  {
    title: "A general-purpose reranker made retrieval worse",
    body:
      "An MS-MARCO cross-encoder was benchmarked and rejected. On “the witness is just repeating what somebody else told him”, the governing provision (QSO Art. 71) ranked #2 with fusion alone, #1 with an LLM reranker, and #10 of 15 with the cross-encoder — every score negative. Those checkpoints are trained on web-search pairs and have no representation of legal doctrine, so the whole corpus is out of distribution. Out-of-domain reranking is worse than none.",
  },
  {
    title: "The harness caught opposing counsel objecting to open questions",
    body:
      "On its first run the courtroom eval found counsel objecting “leading question” to plainly open questions — one of them literally “what did you see outside the market that evening?”. The screening prompt described leading questions without giving a test for one. Adding an explicit test removed both false positives at no cost to recall.",
  },
  {
    title: "The citation audit flagged the judge for refusing a fake provision",
    body:
      "The red-team found a bug in our own machinery: the audit flagged the bench for fabrication when it correctly named a student's invented section in order to reject it. The audit sees a citation absent from the corpus; it cannot tell relying on one from refusing one. Anything shown to a student now uses the attributed field instead.",
  },
  {
    title: "A corrected provision kept the vector of the text it replaced",
    body:
      "Repairing PPC s.375 changed what a student reads and nothing about what retrieval matches. The ingest decided whether to re-embed from whether an embedding existed and which model made it — never from whether the wording had changed — so the corrected provision kept the vector of the definition repealed in 2016. It now records a hash of the exact text embedded and re-embeds when that moves. Fixing the words is not fixing the index.",
  },
  {
    title: "The audit cannot catch a corpus that is wrong",
    body:
      "Diffing the corpus against the official statute text showed “Questions intended to insult or annoy” filed under Art. 143 when it is Art. 148. Every guard in the system passed it, because the audit checks that a citation exists in the corpus and the corpus was its own ground truth. An internally consistent corpus that disagrees with the statute book is invisible to citation auditing — which is why the text is being verified provision by provision.",
  },
];

/** Corpus verification, stated plainly rather than claimed. */
export const CORPUS = {
  command: "pnpm run statutes:verify",
  total: 53,
  confirmed: 45,
  // All four counts are against the same source set — the official PDFs from
  // pakistancode.gov.pk. Mixing editions would make the total meaningless: the
  // National Assembly's 2012 printing of the Constitution returns 5 of 8 where
  // the pakistancode printing returns 2, because the two set their clause
  // numbering differently. Which official edition you diff against is part of
  // the claim, not an implementation detail.
  statutes: [
    { code: "QSO 1984", confirmed: 20, total: 20 },
    { code: "PPC 1860", confirmed: 13, total: 15 },
    { code: "CrPC 1898", confirmed: 8, total: 10 },
    { code: "Constitution 1973", confirmed: 4, total: 8 },
  ],
  note:
    "Every provision was written from model knowledge and each has since been diffed word-for-word against the official pakistancode.gov.pk text, with the wording replaced from the source wherever the two disagreed. The Qanun-e-Shahadat — the instrument every objection in this courtroom rests on — matches the official text in full and is now marked verified, so its citations read ✓ rather than ⚠. The other three instruments still have eight provisions that differ; they stay flagged, and nothing in the app presents an unconfirmed provision as authoritative law. Six numbering errors were found on the way, including an objection ground that cited Art. 143 for a rule that lives in Art. 148.",
};
