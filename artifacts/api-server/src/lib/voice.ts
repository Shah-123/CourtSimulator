/**
 * Speech synthesis for the courtroom's spoken turns.
 *
 * This is the dedicated TTS endpoint, not the audio chat model that the shared
 * integration helper wraps. A chat completion asked to "repeat the following
 * text" is still free to paraphrase, and paraphrasing a transcript that has
 * already passed the citation audit would let a verified citation leave the
 * speaker as a different one — the audit would then be vouching for words
 * nobody said. Synthesis speaks the audited text or it fails; it never rewrites
 * it. That is also why `instructions` below carry delivery only.
 *
 * Output is PCM16 at 24 kHz because that is what the browser playback worklet
 * expects (`useAudioPlayback` opens its AudioContext at sampleRate 24000), so
 * the bytes stream through as base64 with no resampling.
 */

import { openai } from "@workspace/integrations-openai-ai-server";
import type { CourtEventSpeaker } from "./ai-service";

const SPEECH_MODEL = process.env.MODEL_TTS || "gpt-4o-mini-tts";

/**
 * One voice per agent, so a student who hears an objection cut across a witness
 * answer knows two different people spoke without waiting for the transcript.
 * There is no student voice here: the student's own words are never synthesized.
 */
const PERSONA_VOICES: Record<CourtEventSpeaker, string> = {
  judge: "onyx",
  opposing_counsel: "echo",
  witness: "shimmer",
};

/**
 * Delivery direction — how a line is said, never what is said. The words come
 * from the agents in the Python service and are audited before they get here;
 * nothing in this file may alter them.
 */
const DELIVERY: Record<CourtEventSpeaker, string> = {
  judge:
    "Speak as a senior Pakistani High Court judge: measured, unhurried, " +
    "authoritative. A ruling is pronounced, not discussed.",
  opposing_counsel:
    "Speak as a sharp opposing advocate: brisk and assertive, cutting in. " +
    "An objection is called out, not read aloud.",
  witness:
    "Speak as a lay witness under oath: plain, a little hesitant, answering " +
    "the question and no more.",
};

/** The speech endpoint rejects an input over 4096 characters. */
const MAX_INPUT_CHARS = 3800;

/** `instructions` is unsupported on the older TTS models. */
function supportsInstructions(model: string): boolean {
  return model !== "tts-1" && model !== "tts-1-hd";
}

/**
 * Splits an utterance that exceeds the endpoint's input cap, preferring
 * sentence boundaries so the seam between two requests is never audible
 * mid-clause. A single sentence longer than the cap is hard-cut rather than
 * dropped — losing half a ruling silently would be worse than an odd break.
 */
export function splitForSynthesis(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= MAX_INPUT_CHARS) return [trimmed];

  const pieces: string[] = [];
  let current = "";

  for (const sentence of trimmed.split(/(?<=[.!?])\s+/)) {
    for (let i = 0; i < sentence.length; i += MAX_INPUT_CHARS) {
      const part = sentence.slice(i, i + MAX_INPUT_CHARS);
      if (current && current.length + part.length + 1 > MAX_INPUT_CHARS) {
        pieces.push(current);
        current = part;
      } else {
        current = current ? `${current} ${part}` : part;
      }
    }
  }

  if (current) pieces.push(current);
  return pieces;
}

/**
 * Streams one agent's line as base64 PCM16 chunks, in the voice of that agent.
 */
export async function* streamSpeech(
  text: string,
  speaker: CourtEventSpeaker,
): AsyncGenerator<string> {
  // A base64 chunk has to contain whole samples: the browser decodes each one
  // with `new Int16Array(bytes.buffer)`, which throws outright on an odd byte
  // length. A trailing half-sample is carried into the next chunk.
  let carry = Buffer.alloc(0);

  for (const piece of splitForSynthesis(text)) {
    const response = await openai.audio.speech.create({
      model: SPEECH_MODEL,
      voice: PERSONA_VOICES[speaker],
      input: piece,
      response_format: "pcm",
      ...(supportsInstructions(SPEECH_MODEL)
        ? { instructions: DELIVERY[speaker] }
        : {}),
    });

    if (!response.body) {
      throw new Error("Speech synthesis returned an empty body");
    }

    // Node's fetch body is async-iterable at runtime; the DOM-shaped type it is
    // declared with does not say so.
    const chunks = response.body as unknown as AsyncIterable<Uint8Array>;

    for await (const chunk of chunks) {
      const buffer = Buffer.concat([carry, Buffer.from(chunk)]);
      const aligned = buffer.length - (buffer.length % 2);
      carry = Buffer.from(buffer.subarray(aligned));
      if (aligned > 0) {
        yield buffer.subarray(0, aligned).toString("base64");
      }
    }
  }
}
