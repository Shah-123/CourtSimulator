/**
 * Client for the Python AI service.
 *
 * All reasoning — retrieval, citation verification, session memory, agent
 * orchestration — lives in `artifacts/ai-service`. This API keeps ownership of
 * the HTTP contract, session persistence, and voice streaming, and calls
 * across for anything that needs a model.
 *
 * Prompt blocks are built on the Python side and returned ready to embed, so
 * provenance labelling (the "unverified text" warnings that keep unchecked
 * statute text out of quotations) has exactly one implementation.
 */

const BASE_URL =
  process.env.AI_SERVICE_URL?.replace(/\/$/, "") || "http://localhost:8000";

/**
 * Generous by design: a reranked retrieval plus a model call can legitimately
 * take ~10s. Too tight a timeout turns a slow answer into a failed one.
 */
const DEFAULT_TIMEOUT_MS = Number(process.env.AI_SERVICE_TIMEOUT_MS || 60_000);

export class AiServiceError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly path: string,
  ) {
    super(message);
    this.name = "AiServiceError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...init.headers },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AiServiceError(
        `AI service returned ${response.status}: ${body.slice(0, 300)}`,
        response.status,
        path,
      );
    }

    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof AiServiceError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new AiServiceError(
        `AI service timed out after ${timeoutMs}ms`,
        null,
        path,
      );
    }
    throw new AiServiceError(
      `AI service unreachable at ${BASE_URL} (${err instanceof Error ? err.message : "unknown error"})`,
      null,
      path,
    );
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Types mirroring the Python service payloads
// ---------------------------------------------------------------------------

export interface RetrievalScores {
  lexicalRank: number | null;
  bm25Score: number | null;
  vectorRank: number | null;
  vectorSimilarity: number | null;
  rrf: number;
  rerank: number | null;
  rerankerBackend: string | null;
}

export interface RetrievedSection {
  id: number;
  statuteCode: string;
  statuteTitle: string;
  sectionNumber: string;
  citation: string;
  heading: string;
  chapter: string | null;
  content: string;
  verified: boolean;
  sourceUrl: string | null;
  scores: RetrievalScores;
}

export type CitationStatus = "verified" | "not_found" | "uncovered";

export interface CitationCheck {
  raw: string;
  statuteCode: string;
  sectionNumber: string;
  citation: string | null;
  status: CitationStatus;
  heading: string | null;
  content: string | null;
  sourceUrl: string | null;
  verifiedSource: boolean;
}

export interface CitationAudit {
  total: number;
  verified: number;
  hallucinated: number;
  /** 0-100, or null when no citations were made. */
  accuracy: number | null;
  checks: CitationCheck[];
  /** Ready-to-embed prompt block stating the audit as ground truth. */
  promptBlock: string;
}

export interface ObjectionGround {
  id: string;
  label: string;
  description: string;
  citation: string;
  heading: string;
  content: string;
  verified: boolean;
}

export interface SessionMemory {
  summary: string;
  studentClaims: string[];
  witnessTestimony: string[];
  judgeDirections: string[];
}

export interface SessionMemoryWithPrompt extends SessionMemory {
  promptBlock: string;
}

// --- Multi-agent courtroom ---------------------------------------------------

/** One Thought→Action→Observation step of the judge's ReAct loop. */
export interface CourtReasoningStep {
  thought: string;
  action: string;
  observation: string;
}

export interface GroundedProvision {
  citation: string;
  heading: string;
  verified: boolean;
}

export type CourtEventSpeaker = "judge" | "opposing_counsel" | "witness";
export type CourtEventKind =
  | "objection"
  | "ruling"
  | "testimony"
  | "bench"
  | "argument";

/** One AI utterance in a turn, ready to persist as a turn and speak. */
export interface CourtEvent {
  speaker: CourtEventSpeaker;
  kind: CourtEventKind;
  transcript: string;
  ground: string | null;
  citation: string | null;
  ruling: "sustained" | "overruled" | null;
  reasoning: CourtReasoningStep[];
  grounded: GroundedProvision[];
}

export interface CourtObjection {
  groundId: string;
  label: string;
  citation: string;
  heading: string;
  content: string;
  interjection: string;
}

export type TurnCitationAudit = Omit<CitationAudit, "promptBlock"> & {
  /**
   * Citations absent from the corpus that the *agent* introduced, excluding
   * ones the student had already put on the record. An agent naming a made-up
   * section in order to reject it is doing its job, and `hallucinated` cannot
   * tell that apart — this can.
   */
  agentFabricated?: string[];
};

export interface CourtroomTurnResult {
  events: CourtEvent[];
  objection: CourtObjection | null;
  primarySpeaker: CourtEventSpeaker | null;
  citationAudit: TurnCitationAudit;
}

// --- Verdict scoring ---------------------------------------------------------

export interface VerdictCitationCheck {
  raw: string;
  citation: string | null;
  status: CitationStatus;
  heading: string | null;
}

/** The scored verdict, as computed and validated by the AI service. */
export interface ScoredVerdict {
  winningSide: "petitioner" | "respondent";
  overallScore: number;
  legalReasoningScore: number;
  persuasivenessScore: number;
  procedureScore: number;
  factualCommandScore: number;
  judgeRemarks: string;
  strengths: string;
  areasForImprovement: string;
  /** 0-100, or null when the student cited no statutes. */
  citationAccuracy: number | null;
  citationChecks: VerdictCitationCheck[];
}

export interface ScoreVerdictRequest {
  title: string;
  areaOfLaw: string;
  summary: string;
  applicableLaws: string;
  studentSide: "petitioner" | "respondent";
  turns: {
    phase: string;
    speaker: string;
    witnessName: string | null;
    transcript: string;
  }[];
}

/** Payload for one student turn through the multi-agent graph. */
export interface CourtroomTurnRequest {
  sessionId: number;
  phase: string;
  studentSide: "petitioner" | "respondent";
  activeWitness: string | null;
  case: {
    title: string;
    areaOfLaw: string;
    summary: string;
    applicableLaws: string;
    petitionerName: string;
    petitionerRole: string;
    respondentName: string;
    respondentRole: string;
    witnesses: { name: string; role: string; statement: string }[];
  };
  utterance: string;
  workingMemory: {
    speaker: string;
    witnessName: string | null;
    transcript: string;
  }[];
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export async function searchStatutes(
  query: string,
  options: {
    topK?: number;
    statuteCodes?: string[];
    rerank?: boolean;
  } = {},
): Promise<{ results: RetrievedSection[]; promptBlock: string }> {
  return request("/rag/search", {
    method: "POST",
    body: JSON.stringify({
      query,
      top_k: options.topK ?? 5,
      statute_codes: options.statuteCodes ?? null,
      rerank: options.rerank ?? true,
    }),
  });
}

export async function auditCitations(text: string): Promise<CitationAudit> {
  return request("/rag/verify-citations", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function retrieveAreaPalette(
  areaOfLaw: string,
  limit = 12,
): Promise<{
  sections: RetrievedSection[];
  promptBlock: string;
  allowedCitations: string[];
}> {
  return request("/grounding/area-palette", {
    method: "POST",
    body: JSON.stringify({ area_of_law: areaOfLaw, limit }),
  });
}

export async function listObjectionGrounds(): Promise<ObjectionGround[]> {
  return request("/objection-grounds");
}

export async function findObjectionGround(
  groundId: string,
): Promise<ObjectionGround | null> {
  try {
    return await request<ObjectionGround>(
      `/objection-grounds/${encodeURIComponent(groundId)}`,
    );
  } catch (err) {
    if (err instanceof AiServiceError && err.status === 404) return null;
    throw err;
  }
}

export async function refreshSessionMemory(
  sessionId: number,
): Promise<SessionMemory> {
  return request(`/sessions/${sessionId}/memory/refresh`, { method: "POST" });
}

export async function getSessionMemory(
  sessionId: number,
  phase: string,
): Promise<SessionMemoryWithPrompt> {
  return request(
    `/sessions/${sessionId}/memory?phase=${encodeURIComponent(phase)}`,
  );
}

/**
 * Scores a completed session. The judge audits the student's citations and reads
 * the governing provisions before scoring, and rejects (500s) rather than
 * returns a verdict it cannot trust — a non-numeric score or a winner who is not
 * a party to the case.
 */
export async function scoreVerdict(
  payload: ScoreVerdictRequest,
): Promise<ScoredVerdict> {
  return request("/verdict/score", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Runs one student utterance through the multi-agent courtroom graph.
 *
 * Returns the ordered sequence of agent events — an objection, a ruling, a
 * witness answer, however many the moment produced — plus a citation audit over
 * everything the agents said. This API owns turning those events into persisted
 * turns and speech; the graph only reasons.
 */
export async function runCourtroomTurn(
  payload: CourtroomTurnRequest,
): Promise<CourtroomTurnResult> {
  return request("/courtroom/turn", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** The bench's answer to a student interrupting mid-answer. */
export interface InterjectionResult {
  isObjection: boolean;
  objection: CourtObjection | null;
  events: CourtEvent[];
  citationAudit: TurnCitationAudit;
  /** Why nothing was ruled on, when nothing was. */
  note: string | null;
}

/**
 * Classifies a student's interruption and, if it is an objection on a ground
 * the corpus can back, rules on it with the same ReAct judge the agents face.
 */
export async function runInterjection(
  payload: CourtroomTurnRequest,
): Promise<InterjectionResult> {
  return request("/courtroom/interject", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** One message from the courtroom stream: an agent event, or the closing summary. */
export type CourtroomStreamMessage =
  | {
      type: "event";
      event: CourtEvent;
      /** Set once opposing counsel has objected; carries the ground's label. */
      objection: CourtObjection | null;
      /** Audit of this utterance alone, computed before it is spoken. */
      citationAudit: TurnCitationAudit;
    }
  | {
      type: "summary";
      objection: CourtObjection | null;
      primarySpeaker: CourtEventSpeaker | null;
      /** Audit over the whole turn, identical to the batch endpoint's. */
      citationAudit: TurnCitationAudit;
    }
  | { type: "error"; message: string };

/**
 * Runs one student utterance through the graph, yielding each agent event as
 * the graph produces it.
 *
 * The batch `runCourtroomTurn` cannot answer until every agent has finished, so
 * the voice path could not speak counsel's objection until the judge had also
 * ruled — measured at 16.1s of silence before the first sound. Streaming lets
 * each agent be spoken while the next is still reasoning.
 */
export async function* streamCourtroomTurn(
  payload: CourtroomTurnRequest,
): AsyncGenerator<CourtroomStreamMessage> {
  const path = "/courtroom/turn/stream";
  const controller = new AbortController();

  // The timeout guards *connecting*, not the length of the exchange. Once the
  // service starts answering, the turn is bounded by the graph's own capped
  // loops (the judge's ReAct loop is 3 rounds), and a courtroom exchange
  // legitimately outlives a request timeout that was sized for one call.
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new AiServiceError(
      err instanceof Error && err.name === "AbortError"
        ? `AI service timed out after ${DEFAULT_TIMEOUT_MS}ms`
        : `AI service unreachable at ${BASE_URL} (${err instanceof Error ? err.message : "unknown error"})`,
      null,
      path,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AiServiceError(
      `AI service returned ${response.status}: ${body.slice(0, 300)}`,
      response.status,
      path,
    );
  }
  if (!response.body) {
    throw new AiServiceError("AI service returned an empty stream", null, path);
  }

  // NDJSON: one message per line, so a partial line is held back until the rest
  // of it arrives.
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line) as CourtroomStreamMessage;
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) yield JSON.parse(buffer) as CourtroomStreamMessage;
}

/** Verified citations only, in the shape the cases table stores. */
export function verifiedCitations(audit: CitationAudit) {
  return audit.checks
    .filter((check) => check.status === "verified" && check.citation)
    .map((check) => ({
      citation: check.citation as string,
      statuteCode: check.statuteCode,
      heading: check.heading ?? "",
      verified: check.verifiedSource,
    }));
}
