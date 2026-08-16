import path from "path";
import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";
import { spawn } from "child_process";
import { writeFile, unlink, readFile } from "fs/promises";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { join } from "path";

const dir = typeof import.meta !== "undefined" && import.meta.dirname ? import.meta.dirname : process.cwd();
const possibleEnvPaths = [
  path.resolve(dir, "../../../../.env"),
  path.resolve(dir, "../../../.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
  ".env",
];

for (const envPath of possibleEnvPaths) {
  try {
    process.loadEnvFile(envPath);
    if (process.env.OPENAI_API_KEY) break;
  } catch {}
}

const apiKey = process.env.OPENAI_API_KEY || "dummy-key-set-your-openai-api-key-in-env";

export const openai = new OpenAI({
  apiKey,
});


export type AudioFormat = "wav" | "mp3" | "webm" | "mp4" | "ogg" | "unknown";

/**
 * Containers the transcription endpoint reads as they are.
 *
 * Every format `detectAudioFormat` can name is on OpenAI's accepted list for
 * `audio.transcriptions` (flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav,
 * webm), so recognising a container is the same thing as being able to send it.
 * Only `unknown` has to be transcoded.
 *
 * This is deliberately *not* the same set as `voiceChat`'s `inputFormat`: the
 * chat-completions `input_audio` field really does take only wav and mp3, so
 * widening that one would send a container the model cannot read.
 */
export type TranscribableFormat = Exclude<AudioFormat, "unknown">;

/**
 * Detect audio format from buffer magic bytes.
 * Supports: WAV, MP3, WebM (Chrome/Firefox), MP4/M4A/MOV (Safari/iOS), OGG
 */
export function detectAudioFormat(buffer: Buffer): AudioFormat {
  if (buffer.length < 12) return "unknown";

  // WAV: RIFF....WAVE
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46
  ) {
    return "wav";
  }
  // WebM: EBML header
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return "webm";
  }
  // MP3: ID3 tag or frame sync
  if (
    (buffer[0] === 0xff &&
      (buffer[1] === 0xfb || buffer[1] === 0xfa || buffer[1] === 0xf3)) ||
    (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33)
  ) {
    return "mp3";
  }
  // MP4/M4A/MOV: ....ftyp (Safari/iOS records in these containers)
  if (
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    return "mp4";
  }
  // OGG: OggS
  if (
    buffer[0] === 0x4f &&
    buffer[1] === 0x67 &&
    buffer[2] === 0x67 &&
    buffer[3] === 0x53
  ) {
    return "ogg";
  }
  return "unknown";
}

/**
 * Convert any audio/video format to WAV using ffmpeg.
 */
export async function convertToWav(audioBuffer: Buffer): Promise<Buffer> {
  const inputPath = join(tmpdir(), `input-${randomUUID()}`);
  const outputPath = join(tmpdir(), `output-${randomUUID()}.wav`);

  try {
    await writeFile(inputPath, audioBuffer);

    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i",
        inputPath,
        "-vn",
        "-f",
        "wav",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-acodec",
        "pcm_s16le",
        "-y",
        outputPath,
      ]);

      ffmpeg.stderr.on("data", () => {});
      ffmpeg.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
      ffmpeg.on("error", reject);
    });

    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

/**
 * Auto-detect and convert audio to OpenAI-compatible format.
 */
export async function ensureCompatibleFormat(
  audioBuffer: Buffer,
): Promise<{ buffer: Buffer; format: TranscribableFormat }> {
  const detected = detectAudioFormat(audioBuffer);

  // A recognised container goes to the transcription endpoint untouched.
  // Transcoding it would be redundant — the endpoint reads all of them — and
  // it was worse than redundant in practice: this branch previously converted
  // everything except wav and mp3, which meant every microphone turn shelled
  // out to ffmpeg. Chrome's MediaRecorder emits webm and nothing else, so the
  // one path a student actually uses depended on an external binary being
  // installed on the presenting machine, while the synthesized-audio tests
  // (wav/mp3) returned above it and never noticed. It also spent a transcode
  // on the leg where transcription latency is already the largest block
  // before the court speaks.
  if (detected !== "unknown") {
    return { buffer: audioBuffer, format: detected };
  }

  // Genuinely unrecognised bytes are still worth a try through ffmpeg: it
  // reads far more containers than the magic-byte check names. This is now the
  // only branch that needs ffmpeg on PATH, and reaching it means we could not
  // identify the audio at all.
  const wavBuffer = await convertToWav(audioBuffer);
  return { buffer: wavBuffer, format: "wav" };
}

/** Voice Chat: audio-in, audio-out using gpt-audio-1.5. */
export async function voiceChat(
  audioBuffer: Buffer,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy",
  inputFormat: "wav" | "mp3" = "wav",
  outputFormat: "wav" | "mp3" = "mp3",
): Promise<{ transcript: string; audioResponse: Buffer }> {
  const audioBase64 = audioBuffer.toString("base64");
  const response = await openai.chat.completions.create({
    model: process.env.MODEL_AUDIO || "gpt-4o-audio-preview",
    modalities: ["text", "audio"],
    audio: { voice, format: outputFormat },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "input_audio",
            input_audio: { data: audioBase64, format: inputFormat },
          },
        ],
      },
    ],
  });
  const message = response.choices[0]?.message as any;
  const transcript = message?.audio?.transcript || message?.content || "";
  const audioData = message?.audio?.data ?? "";
  return {
    transcript,
    audioResponse: Buffer.from(audioData, "base64"),
  };
}

/** Streaming Voice Chat for real-time audio responses. */
export async function voiceChatStream(
  audioBuffer: Buffer,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy",
  inputFormat: "wav" | "mp3" = "wav",
): Promise<AsyncIterable<{ type: "transcript" | "audio"; data: string }>> {
  const audioBase64 = audioBuffer.toString("base64");
  const stream = await openai.chat.completions.create({
    model: process.env.MODEL_AUDIO || "gpt-4o-audio-preview",
    modalities: ["text", "audio"],
    audio: { voice, format: "pcm16" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "input_audio",
            input_audio: { data: audioBase64, format: inputFormat },
          },
        ],
      },
    ],
    stream: true,
  });

  return (async function* () {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta as any;
      if (!delta) continue;
      if (delta?.audio?.transcript) {
        yield { type: "transcript", data: delta.audio.transcript };
      }
      if (delta?.audio?.data) {
        yield { type: "audio", data: delta.audio.data };
      }
    }
  })();
}

/** Text-to-Speech using gpt-audio-1.5. */
export async function textToSpeech(
  text: string,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy",
  format: "wav" | "mp3" | "flac" | "opus" | "pcm16" = "wav",
): Promise<Buffer> {
  const response = await openai.chat.completions.create({
    model: process.env.MODEL_AUDIO || "gpt-4o-audio-preview",
    modalities: ["text", "audio"],
    audio: { voice, format },
    messages: [
      {
        role: "system",
        content: "You are an assistant that performs text-to-speech.",
      },
      { role: "user", content: `Repeat the following text verbatim: ${text}` },
    ],
  });
  const audioData = (response.choices[0]?.message as any)?.audio?.data ?? "";
  return Buffer.from(audioData, "base64");
}

/** Streaming Text-to-Speech. */
export async function textToSpeechStream(
  text: string,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy",
): Promise<AsyncIterable<string>> {
  const stream = await openai.chat.completions.create({
    model: process.env.MODEL_AUDIO || "gpt-4o-audio-preview",
    modalities: ["text", "audio"],
    audio: { voice, format: "pcm16" },
    messages: [
      {
        role: "system",
        content: "You are an assistant that performs text-to-speech.",
      },
      { role: "user", content: `Repeat the following text verbatim: ${text}` },
    ],
    stream: true,
  });

  return (async function* () {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta as any;
      if (!delta) continue;
      if (delta?.audio?.data) {
        yield delta.audio.data;
      }
    }
  })();
}

/**
 * Speech-to-Text using whisper-1.
 *
 * `vocabulary` is Whisper's prompt parameter: a hint of proper nouns the
 * decoder should expect. It biases spelling only — it cannot add words the
 * speaker did not say — and matters for names the model has no prior for.
 */
export async function speechToText(
  audioBuffer: Buffer,
  format: TranscribableFormat = "wav",
  vocabulary?: string,
): Promise<string> {
  const file = await toFile(audioBuffer, `audio.${format}`);
  const response = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    ...(vocabulary ? { prompt: vocabulary } : {}),
  });
  return response.text;
}

/** Streaming Speech-to-Text. */
export async function speechToTextStream(
  audioBuffer: Buffer,
  format: TranscribableFormat = "wav",
): Promise<AsyncIterable<string>> {
  const file = await toFile(audioBuffer, `audio.${format}`);
  const stream = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    stream: true,
  });

  return (async function* () {
    for await (const event of stream) {
      if (event.type === "transcript.text.delta") {
        yield event.delta;
      }
    }
  })();
}
