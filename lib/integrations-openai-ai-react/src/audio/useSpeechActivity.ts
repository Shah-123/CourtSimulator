/**
 * Voice-activity detection over a live MediaStream.
 *
 * Exists so a user can interrupt a response that is still playing. The two
 * edges are deliberately asymmetric: speech has to persist for a moment before
 * it counts as starting (a cough or a keyboard should not cut the audio off),
 * and silence has to persist much longer before it counts as ending (people
 * pause mid-sentence, and clipping someone the instant they draw breath is the
 * thing that makes voice interfaces feel hostile).
 *
 * Detection is plain RMS energy rather than a model: it runs locally, adds no
 * latency, and needs no network. It cannot tell speech from a slammed door —
 * whoever is listening decides what an interruption means, which on this app is
 * done server-side by transcribing it.
 */
import { useEffect, useRef, useState } from "react";

interface SpeechActivityOptions {
  enabled: boolean;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  /** RMS amplitude counted as speech. Raise it in a noisy room. */
  threshold?: number;
  /** How long speech must persist before it counts as started. */
  startMs?: number;
  /** How long silence must persist before it counts as ended. */
  endMs?: number;
}

export function useSpeechActivity(
  stream: MediaStream | null,
  {
    enabled,
    onSpeechStart,
    onSpeechEnd,
    threshold = 0.05,
    startMs = 250,
    endMs = 1400,
  }: SpeechActivityOptions
) {
  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);

  // Held in refs so a caller passing inline arrows does not tear down and
  // rebuild the audio graph on every render.
  const startRef = useRef(onSpeechStart);
  const endRef = useRef(onSpeechEnd);
  startRef.current = onSpeechStart;
  endRef.current = onSpeechEnd;

  useEffect(() => {
    if (!enabled || !stream) {
      setLevel(0);
      setSpeaking(false);
      return;
    }

    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);

    const samples = new Float32Array(analyser.fftSize);
    let frame = 0;
    let loudSince: number | null = null;
    let quietSince: number | null = null;
    let active = false;

    const tick = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      const rms = Math.sqrt(sum / samples.length);
      setLevel(rms);

      const now = performance.now();
      if (rms > threshold) {
        quietSince = null;
        if (loudSince === null) loudSince = now;
        if (!active && now - loudSince >= startMs) {
          active = true;
          setSpeaking(true);
          startRef.current?.();
        }
      } else {
        loudSince = null;
        if (active) {
          if (quietSince === null) quietSince = now;
          if (now - quietSince >= endMs) {
            active = false;
            setSpeaking(false);
            endRef.current?.();
          }
        }
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void context.close();
    };
  }, [enabled, stream, threshold, startMs, endMs]);

  return { level, speaking };
}
