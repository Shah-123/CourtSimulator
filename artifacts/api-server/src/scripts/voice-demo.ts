/**
 * Voices the captured run, one distinct voice per agent.
 *
 * The recorded demo already holds every word the agents actually said. This
 * turns those words into the audio the presenter plays, so the bench, opposing
 * counsel and each witness are told apart by ear rather than by reading a
 * label — which is the whole claim being demonstrated: that these are separate
 * agents, not one model changing its tone.
 *
 *   pnpm run voice-demo
 *   pnpm run voice-demo --force        # re-voice files that already exist
 *   pnpm run voice-demo --only judge   # one speaker, e.g. after a re-capture
 *
 * Reads `demo-run.json` and writes `<id>.mp3` beside it in the web app's public
 * directory, matching the filenames in `docs/demo-tts-manifest.md`. Counsel's
 * lines are deliberately absent: the presenter speaks those live.
 *
 * Uses the dedicated speech endpoint rather than `textToSpeech` from the audio
 * library. That helper drives a conversational audio model with an instruction
 * to "repeat the following text verbatim", which is right for a live turn but
 * wrong here — the page prints the transcript beside the audio, so a model that
 * paraphrases by a word puts the caption out of step with the voice. The
 * speech endpoint reproduces the string by construction.
 *
 * Idempotent: an existing file is left alone unless --force. Re-running after a
 * partial failure costs only the missing lines.
 */
import { mkdir, writeFile, access } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { openai } from "@workspace/integrations-openai-ai-server";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");

// Same single .env every other service reads; this script imports no database.
try {
  process.loadEnvFile(path.join(REPO_ROOT, ".env"));
} catch {
  // Already exported in the environment, or genuinely absent — the API client
  // reports a missing key far more clearly than a guess here would.
}

const FIXTURE_PATH = path.join(
  REPO_ROOT,
  "artifacts/adalat-ai/src/data/demo-run.json",
);
const AUDIO_DIR = path.join(REPO_ROOT, "artifacts/adalat-ai/public/demo");

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const ONLY = (() => {
  const i = args.indexOf("--only");
  return i >= 0 ? (args[i + 1] ?? null) : null;
})();

// Must match `SPEECH_MODEL` in lib/voice.ts. Both read MODEL_TTS, so a default
// of its own here meant the recorded run and the live session spoke through
// different engines whenever the variable was unset — the replay would not
// sound like the thing it is a recording of.
const MODEL = process.env.MODEL_TTS || "gpt-4o-mini-tts";

/**
 * A voice per speaker. The three role voices deliberately mirror
 * `PERSONA_VOICES` in lib/voice.ts, so a recorded agent sounds like the same
 * agent does live — they are kept in step by hand because that map is module
 * private and widening its surface for a replay tool is the wrong trade.
 *
 * The second witness is the one deliberate divergence. Live, every witness
 * speaks in shimmer; there is only ever one on the stand and the student can
 * see whose name is on the record. A recording played to a room has no such
 * cue, and a listener should hear that the alibi witness in cross is not the
 * eyewitness from examination-in-chief — which is the point of beats 3 and 7
 * sitting back to back.
 */
const VOICES = {
  judge: "onyx",
  opposing_counsel: "echo",
  witness: "shimmer",
  "witness:Reema Khan": "nova",
} as const;

type Voice = (typeof VOICES)[keyof typeof VOICES];

interface CapturedEvent {
  id: string;
  speaker: string;
  witnessName: string | null;
  transcript: string;
  ruling?: string | null;
}

function voiceFor(event: CapturedEvent): Voice {
  if (event.witnessName) {
    const keyed = `witness:${event.witnessName}` as keyof typeof VOICES;
    if (keyed in VOICES) return VOICES[keyed];
  }
  const key = event.speaker as keyof typeof VOICES;
  return VOICES[key] ?? "alloy";
}

/**
 * What the court actually hears.
 *
 * The bench's transcript carries a leading `[SUSTAINED]` marker, which is
 * apparatus for the page rather than speech — a judge says the word, not the
 * brackets. Spoken as a sentence of its own so the ruling lands before the
 * reasoning, the way it does from a real bench.
 */
function spokenText(event: CapturedEvent): string {
  const match = event.transcript.match(/^\[([A-Z]+)\]\s*(.*)$/s);
  if (!match) return event.transcript;
  const [, marker, rest] = match;
  return `${marker.charAt(0)}${marker.slice(1).toLowerCase()}. ${rest}`;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const fixture = (await import(`file://${FIXTURE_PATH}`, {
    with: { type: "json" },
  })) as { default: { capturedAt: string; exchanges: { events: CapturedEvent[] }[] } };

  const events = fixture.default.exchanges.flatMap((x) => x.events);
  const wanted = ONLY
    ? events.filter((e) => e.speaker === ONLY || e.witnessName === ONLY)
    : events;

  if (wanted.length === 0) {
    throw new Error(
      ONLY
        ? `No events for --only ${ONLY}. Speakers present: ` +
          [...new Set(events.map((e) => e.speaker))].join(", ")
        : "The captured run has no agent events — run `pnpm run capture-demo` first.",
    );
  }

  await mkdir(AUDIO_DIR, { recursive: true });
  console.log(
    `Voicing ${wanted.length} line(s) from the run captured ${fixture.default.capturedAt}\n` +
      `  model ${MODEL} → ${path.relative(REPO_ROOT, AUDIO_DIR)}\n`,
  );

  let written = 0;
  let skipped = 0;
  const failed: string[] = [];

  // Sequential rather than gathered. Sixteen short files are not worth a
  // concurrency story, and a burst risks a rate limit that would leave the set
  // half-written for no gain in wall time worth having.
  for (const event of wanted) {
    const file = path.join(AUDIO_DIR, `${event.id}.mp3`);
    const voice = voiceFor(event);
    const who = event.witnessName ?? event.speaker;

    if (!FORCE && (await exists(file))) {
      console.log(`  skip   ${event.id}.mp3  (exists)`);
      skipped += 1;
      continue;
    }

    try {
      const response = await openai.audio.speech.create({
        model: MODEL,
        voice,
        input: spokenText(event),
        response_format: "mp3",
      });
      const audio = Buffer.from(await response.arrayBuffer());
      await writeFile(file, audio);
      console.log(
        `  wrote  ${event.id}.mp3  ${voice.padEnd(8)} ${who}` +
          `  (${Math.round(audio.length / 1024)} kB)`,
      );
      written += 1;
    } catch (err) {
      // One bad line must not cost the fifteen that already worked. The page
      // renders a missing file as text on a timer, so a partial set is still
      // presentable and re-running fills only the gaps.
      console.error(
        `  FAILED ${event.id}.mp3  ${err instanceof Error ? err.message : err}`,
      );
      failed.push(event.id);
    }
  }

  console.log(
    `\n${written} written, ${skipped} already present` +
      (failed.length ? `, ${failed.length} failed: ${failed.join(", ")}` : ""),
  );
  if (failed.length) {
    console.log("Re-run to retry only the missing ones.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("\nVoicing failed:", err instanceof Error ? err.message : err);
  console.error(
    "\nNeeds OPENAI_API_KEY and a captured run on disk. Nothing partial is\n" +
      "left behind that a re-run will not fix.",
  );
  process.exitCode = 1;
});
