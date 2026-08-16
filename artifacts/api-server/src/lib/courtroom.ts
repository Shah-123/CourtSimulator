import type { Case, ReasoningStep } from "@workspace/db";
import type { CourtEvent, CourtObjection } from "./ai-service";

export type SessionPhase =
  | "opening"
  | "witness_examination"
  | "cross_examination"
  | "closing"
  | "verdict";

export type StudentSide = "petitioner" | "respondent";

export type TurnSpeaker = "student" | "judge" | "opposing_counsel" | "witness";

export const PHASE_ORDER: SessionPhase[] = [
  "opening",
  "witness_examination",
  "cross_examination",
  "closing",
  "verdict",
];

export function isSessionPhase(value: string): value is SessionPhase {
  return PHASE_ORDER.includes(value as SessionPhase);
}

export function isStudentSide(value: string): value is StudentSide {
  return value === "petitioner" || value === "respondent";
}

export function isValidPhaseTransition(
  current: SessionPhase,
  next: SessionPhase,
): boolean {
  const currentIndex = PHASE_ORDER.indexOf(current);
  const nextIndex = PHASE_ORDER.indexOf(next);
  return nextIndex === currentIndex + 1;
}

export function oppositeSide(side: StudentSide): StudentSide {
  return side === "petitioner" ? "respondent" : "petitioner";
}

/**
 * Decides which AI persona should reply to the student's next spoken turn,
 * based on the current courtroom phase and (if applicable) the most
 * recently called witness.
 */
export function determineRespondingPersona(
  phase: SessionPhase,
  activeWitnessName: string | null,
): { persona: TurnSpeaker; witnessName: string | null } {
  if (
    (phase === "witness_examination" || phase === "cross_examination") &&
    activeWitnessName
  ) {
    return { persona: "witness", witnessName: activeWitnessName };
  }
  if (phase === "cross_examination") {
    return { persona: "opposing_counsel", witnessName: null };
  }
  return { persona: "judge", witnessName: null };
}

/**
 * The slice of the case record the courtroom agents receive.
 *
 * Four call sites need this payload — the text turn, the voice turn, an
 * interjection, and the simulate script — and each used to build it by hand. A
 * field added to three of the four is a silent divergence between the text and
 * voice courtrooms, which is exactly what the AI service already guards against
 * by defining `run_turn` in terms of `run_turn_stream`. This is the same guard,
 * one step earlier, on the request.
 */
export function courtroomCaseBrief(courtCase: Case) {
  return {
    title: courtCase.title,
    areaOfLaw: courtCase.areaOfLaw,
    summary: courtCase.summary,
    applicableLaws: courtCase.applicableLaws,
    petitionerName: courtCase.petitionerName,
    petitionerRole: courtCase.petitionerRole,
    respondentName: courtCase.respondentName,
    respondentRole: courtCase.respondentRole,
    witnesses: courtCase.witnesses.map((w) => ({
      name: w.name,
      role: w.role,
      statement: w.statement,
    })),
    // Null for library cases and anything generated before the brief existed.
    // The agents render an absent brief identically to the old context string.
    brief: courtCase.brief,
  };
}

/**
 * The proper nouns this case is about, as a spelling hint for transcription.
 *
 * Whisper has no prior for Pakistani names and renders them phonetically —
 * "Mr. Nabi" came back as "Mr. Nobby", which then reaches the agents as the
 * name of a witness who does not exist. Handing it the parties and witnesses
 * off the case file fixes the spelling of exactly the words a moot court says
 * most often.
 *
 * This is a vocabulary hint for the transcriber, not a prompt for a reasoning
 * model, and the names come from the case record rather than from anything the
 * student said.
 */
export function transcriptionHint(courtCase: Case): string {
  const names = [
    courtCase.petitionerName,
    courtCase.respondentName,
    ...courtCase.witnesses.map((w) => w.name),
  ].filter(Boolean);

  return (
    "A Pakistani moot court hearing. Names and terms used: " +
    `${names.join(", ")}. ` +
    "Qanun-e-Shahadat Order, Pakistan Penal Code, Code of Criminal Procedure, " +
    "My Lord, learned counsel, objection, sustained, overruled."
  );
}

/** A graph event rendered for persistence as a turn. */
export interface RecordedEvent {
  speaker: TurnSpeaker;
  witnessName: string | null;
  transcript: string;
  /**
   * The bench's ReAct trace, kept with the ruling it produced.
   *
   * The graph returns this on every ruling, but it used to live only in the
   * turn response, so reloading the page left a ruling with no visible basis.
   * Persisting it means the record can always show what the judge read before
   * it ruled — which is the difference between a ruling that is grounded and
   * one that is merely asserted to be.
   */
  reasoning: ReasoningStep[] | null;
}

const RULING_PREFIX = /^\[(SUSTAINED|OVERRULED)\]\s*/i;

/**
 * Renders one agent event into the courtroom record.
 *
 * The `[OBJECTION: …]` / `[RULING: …]` prefixes are not decoration — the
 * session transcript parses them to render an objection and a ruling
 * distinctly, and the manually-raised objection route has always written them.
 * Routing both the text turn and the voice turn through here means the graph's
 * objections appear in the record the same way a student's own do, instead of
 * as an unlabelled line of dialogue.
 *
 * Only the graph's own machine prefix is rewritten. Nothing else in the
 * transcript is stripped: an agent that carried through the unverified-text
 * marker keeps it.
 */
export function recordEvent(
  event: CourtEvent,
  objection: CourtObjection | null,
  activeWitness: string | null,
): RecordedEvent {
  const witnessName = event.speaker === "witness" ? activeWitness : null;
  // Empty is stored as null rather than [], so "no trace" is one value in the
  // record instead of two the UI would each have to test for.
  const reasoning = event.reasoning?.length ? event.reasoning : null;

  if (event.kind === "objection") {
    // The event carries the ground *id*; the objection carries the label the
    // record shows ("Leading Question" rather than "leading_question").
    const ground = [objection?.label ?? event.ground, event.citation]
      .filter(Boolean)
      .join(" — ");
    return {
      speaker: event.speaker,
      witnessName,
      transcript: `[OBJECTION: ${ground || "Evidentiary Objection"}] ${event.transcript}`,
      reasoning,
    };
  }

  if (event.kind === "ruling" && event.ruling) {
    return {
      speaker: event.speaker,
      witnessName,
      transcript: `[RULING: ${event.ruling.toUpperCase()}] ${event.transcript.replace(RULING_PREFIX, "")}`,
      reasoning,
    };
  }

  return {
    speaker: event.speaker,
    witnessName,
    transcript: event.transcript,
    reasoning,
  };
}

/**
 * The same event as spoken words.
 *
 * A judge says "Sustained." — reading the graph's `[SUSTAINED]` marker aloud
 * bracket and all would sound like a machine. Only that one known prefix is
 * rewritten; no general stripping happens here, because a blanket
 * bracket-removal would also swallow the unverified-text marker.
 */
export function speechText(event: CourtEvent): string {
  if (event.kind === "ruling" && event.ruling) {
    const spokenRuling = event.ruling === "sustained" ? "Sustained." : "Overruled.";
    return `${spokenRuling} ${event.transcript.replace(RULING_PREFIX, "")}`.trim();
  }
  return event.transcript.trim();
}

/**
 * Builds the system prompt that grounds the AI in its current role: judge,
 * opposing counsel, or a specific witness, for a specific Pakistani-law case.
 */
export function buildSystemPrompt(
  courtCase: Case,
  studentSide: StudentSide,
  phase: SessionPhase,
  persona: TurnSpeaker,
  witnessName: string | null,
): string {
  const studentParty =
    studentSide === "petitioner"
      ? courtCase.petitionerName
      : courtCase.respondentName;
  const studentRole =
    studentSide === "petitioner"
      ? courtCase.petitionerRole
      : courtCase.respondentRole;
  const opposingSide = oppositeSide(studentSide);
  const opposingParty =
    opposingSide === "petitioner"
      ? courtCase.petitionerName
      : courtCase.respondentName;
  const opposingRole =
    opposingSide === "petitioner"
      ? courtCase.petitionerRole
      : courtCase.respondentRole;

  const caseContext = `
Case: "${courtCase.title}" (${courtCase.areaOfLaw} matter under Pakistani law, difficulty: ${courtCase.difficulty})
Summary: ${courtCase.summary}
Applicable laws: ${courtCase.applicableLaws}
Petitioner: ${courtCase.petitionerName} (${courtCase.petitionerRole})
Respondent: ${courtCase.respondentName} (${courtCase.respondentRole})
The student is arguing as the ${studentSide.toUpperCase()} -- ${studentParty}, ${studentRole}.
Current courtroom phase: ${phase.replace("_", " ")}.
`.trim();

  if (persona === "judge") {
    return `You are a stern but fair judge presiding over a Pakistani court, moderating a moot-court practice session. ${caseContext}

Speak as the judge would in a Pakistani courtroom: measured, formal, addressing the student as "counsel" or "learned counsel". Respond briefly (2-4 sentences) to what the student just said -- acknowledge their point, probe with a pointed question about their legal reasoning or evidence, or direct them procedurally (e.g. to call a witness, or proceed to the next stage) when appropriate. Do not resolve the case yourself and do not give the student legal advice. Stay strictly in character as the judge.`;
  }

  if (persona === "opposing_counsel") {
    return `You are opposing counsel representing ${opposingParty} (${opposingRole}) in a Pakistani court, cross-examining or rebutting the student who represents ${studentParty} (${studentRole}). ${caseContext}

Speak as sharp, professional opposing counsel: challenge the student's argument, raise counterpoints grounded in the applicable laws, or pose a pointed cross-examination question. Keep responses brief (2-4 sentences) and combative but professional, in the register of a real Pakistani courtroom advocate. Stay strictly in character.`;
  }

  const witness = courtCase.witnesses.find((w) => w.name === witnessName);
  const witnessStatement = witness?.statement ?? "";
  const witnessRole = witness?.role ?? "witness";

  return `You are ${witnessName}, a ${witnessRole} testifying as a witness in a Pakistani court. ${caseContext}

Your known testimony/statement: "${witnessStatement}"

Answer the student's question as this witness would: consistently with your statement, in first person, briefly (2-4 sentences), showing appropriate nervousness or confidence depending on the question. Do not break character or acknowledge you are an AI.`;
}
