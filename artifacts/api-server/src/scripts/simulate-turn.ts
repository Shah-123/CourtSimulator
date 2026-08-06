/**
 * Runs one courtroom turn in text mode, using exactly the prompt the voice
 * endpoint builds — same persona selection, same long-term memory injection,
 * same working memory. Only the speech-to-text and text-to-speech legs are
 * skipped.
 *
 * This exists so agent behaviour can be tested and evaluated without a
 * microphone, which the eval harness depends on.
 *
 *   pnpm run simulate-turn <sessionId> "<what the student says>"
 *   pnpm run simulate-turn 8 --phase closing "My client was in Karachi that night"
 */
import { eq } from "drizzle-orm";
import {
  db,
  pool,
  casesTable,
  sessionsTable,
  turnsTable,
  type Turn,
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  buildSystemPrompt,
  determineRespondingPersona,
  isSessionPhase,
  isStudentSide,
} from "../lib/courtroom";
import { getSessionMemory } from "../lib/ai-service";

const args = process.argv.slice(2);
const phaseFlag = args.indexOf("--phase");
const phaseOverride = phaseFlag >= 0 ? args[phaseFlag + 1] : null;
const positional = args.filter(
  (arg, i) => !arg.startsWith("--") && i !== phaseFlag + 1,
);
const sessionId = Number(positional[0]);
const utterance = positional.slice(1).join(" ");

if (!Number.isInteger(sessionId) || !utterance) {
  console.error(
    'Usage: pnpm run simulate-turn <sessionId> [--phase <phase>] "<student utterance>"',
  );
  process.exit(1);
}

async function main() {
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId));
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const [courtCase] = await db
    .select()
    .from(casesTable)
    .where(eq(casesTable.id, session.caseId));
  if (!courtCase) throw new Error("Case not found for session");

  const turns: Turn[] = await db
    .select()
    .from(turnsTable)
    .where(eq(turnsTable.sessionId, sessionId))
    .orderBy(turnsTable.createdAt);

  const phase = phaseOverride ?? session.phase;
  if (!isSessionPhase(phase)) throw new Error(`Invalid phase: ${phase}`);
  if (!isStudentSide(session.studentSide)) {
    throw new Error(`Invalid student side: ${session.studentSide}`);
  }

  const activeWitnessTurn = [...turns]
    .reverse()
    .find((t) => t.speaker === "witness" && t.phase === phase);
  const { persona, witnessName } = determineRespondingPersona(
    phase,
    activeWitnessTurn?.witnessName ?? null,
  );

  const memory = await getSessionMemory(session.id, phase).catch(() => null);

  const systemPrompt = [
    buildSystemPrompt(
      courtCase,
      session.studentSide,
      phase,
      persona,
      witnessName,
    ),
    memory?.promptBlock ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const historyMessages = turns
    .filter((t) => t.phase === phase)
    .map((t) => ({
      role: (t.speaker === "student" ? "user" : "assistant") as
        | "user"
        | "assistant",
      content: t.transcript,
    }));

  console.log(`\nsession ${sessionId} · phase ${phase} · responding: ${persona}`);
  console.log(
    `long-term memory: ${memory?.summary ? `${memory.studentClaims.length} prior claims` : "none"}`,
  );
  console.log(`working memory: ${historyMessages.length} turns in this phase`);
  console.log(`\nSTUDENT: ${utterance}\n`);

  const completion = await openai.chat.completions.create({
    model: process.env.MODEL_TEXT || "gpt-4o",
    max_completion_tokens: 400,
    messages: [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: utterance },
    ],
  });

  console.log(
    `${persona.toUpperCase()}: ${completion.choices[0]?.message?.content ?? "(no reply)"}\n`,
  );
}

main()
  .catch((err) => {
    console.error("Simulation failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
