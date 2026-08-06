import { useState, useEffect, useRef } from "react";
import {
  useVoiceRecorder,
  useVoiceStream,
  useSpeechActivity,
  type AppEvent,
} from "@workspace/integrations-openai-ai-react/audio";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/components/api-state";
import { useToast } from "@/hooks/use-toast";

interface VoiceRecorderProps {
  sessionId: number;
  onTurnComplete: () => void;
  disabled?: boolean;
}

/**
 * One agent taking the floor. A single spoken turn can produce several of these
 * in sequence — counsel objects, the bench rules, then the witness answers —
 * so the caption has to say who is speaking rather than assume the bench.
 */
interface SpeakerCue {
  speaker: "judge" | "opposing_counsel" | "witness";
  kind: "objection" | "ruling" | "testimony" | "bench" | "argument";
  witnessName: string | null;
  citation: string | null;
  ruling: "sustained" | "overruled" | null;
  /** Provenance of anything this agent cited; drives the unverified warning. */
  grounded: { citation: string; heading: string; verified: boolean }[];
  /**
   * Citations the audit could not find in the corpus at all. Checked before the
   * line was spoken, so the warning is on screen while the student hears it.
   */
  fabricated: string[];
  /**
   * The bench's ReAct trace, arriving with the ruling rather than after it, so
   * a student hearing "sustained" can see what the judge read to get there
   * while it is still being said.
   */
  reasoning: { thought: string; action: string; observation: string }[];
}

function parseSpeakerCue(event: AppEvent): SpeakerCue | null {
  if (event.type !== "speaker") return null;
  const speaker = event.speaker;
  if (
    speaker !== "judge" &&
    speaker !== "opposing_counsel" &&
    speaker !== "witness"
  ) {
    return null;
  }
  return {
    speaker,
    kind: (event.kind as SpeakerCue["kind"]) ?? "bench",
    witnessName:
      typeof event.witnessName === "string" ? event.witnessName : null,
    citation: typeof event.citation === "string" ? event.citation : null,
    ruling:
      event.ruling === "sustained" || event.ruling === "overruled"
        ? event.ruling
        : null,
    grounded: Array.isArray(event.grounded)
      ? (event.grounded as SpeakerCue["grounded"])
      : [],
    fabricated: Array.isArray(event.fabricated)
      ? (event.fabricated as string[])
      : [],
    reasoning: Array.isArray(event.reasoning)
      ? (event.reasoning as SpeakerCue["reasoning"])
      : [],
  };
}

function speakerLabel(cue: SpeakerCue): string {
  if (cue.speaker === "witness") {
    return cue.witnessName ? `Witness — ${cue.witnessName}` : "The witness";
  }
  return cue.speaker === "judge" ? "The Bench" : "Opposing counsel";
}

const TICKS = 28;

/**
 * A level rule rather than a pulsing orb. In a voice-first app the one thing a
 * student needs to know before they commit to a sentence is whether the room
 * can hear them, and an amplitude reading answers that where an animation that
 * runs regardless does not.
 */
function LevelRule({ level, live }: { level: number; live: boolean }) {
  // RMS speech sits around 0.05–0.25; scale so a normal voice fills most of it.
  const lit = live ? Math.min(TICKS, Math.round((level / 0.22) * TICKS)) : 0;

  return (
    <div
      className="flex h-4 items-end gap-[3px]"
      role="presentation"
      aria-hidden="true"
    >
      {Array.from({ length: TICKS }, (_, i) => (
        <span
          key={i}
          className={cn(
            "w-[2px] rounded-full transition-[height,background-color] duration-75",
            i < lit ? "bg-primary" : "bg-rule",
          )}
          style={{ height: i < lit ? `${40 + (i / TICKS) * 60}%` : "22%" }}
        />
      ))}
    </div>
  );
}

export function VoiceControl({
  sessionId,
  onTurnComplete,
  disabled,
}: VoiceRecorderProps) {
  const [streamState, setStreamState] = useState<
    "idle" | "processing" | "playing" | "interrupting"
  >("idle");
  const [cue, setCue] = useState<SpeakerCue | null>(null);
  const [caption, setCaption] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const recorder = useVoiceRecorder();
  // A second recorder, open only while the court is speaking. Keeping it apart
  // from the turn recorder means an interruption can be captured without
  // disturbing the state of the turn that is still playing.
  const interrupter = useVoiceRecorder();
  const { toast } = useToast();

  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const workletUrl = `${baseUrl}/audio-playback-worklet.js`;

  const stream = useVoiceStream({
    workletPath: workletUrl,
    // The server announces each agent before speaking it, so the caption can
    // switch speaker mid-turn instead of attributing an objection to the bench.
    onEvent: (event) => {
      const next = parseSpeakerCue(event);
      if (next) {
        setCue(next);
        setCaption("");
        setNote(null);
        return;
      }
      // The bench declining to rule on an interruption — say why rather than
      // leaving the student wondering whether they were heard at all.
      if (event.type === "note" && typeof event.data === "string") {
        setNote(event.data);
      }
    },
    onTranscript: (delta) => setCaption((text) => text + delta),
    onComplete: () => {
      setStreamState("idle");
      onTurnComplete(); // Trigger refresh of transcript
    },
    onError: (err) => {
      console.error("Voice stream error:", err);
      setStreamState("idle");
      toast({
        variant: "destructive",
        title: "The spoken response failed",
        description: getErrorMessage(err),
      });
    },
  });

  // --- Barge-in ------------------------------------------------------------
  // A real advocate objects over the answer, not after it. While the court is
  // speaking the mic stays open; the moment the student starts talking,
  // playback is cut and whatever they said is sent to the bench as a possible
  // objection. Echo cancellation on the capture stream is what stops the
  // court's own voice from triggering this.
  const bargingRef = useRef(false);
  const listening = streamState === "playing" || streamState === "interrupting";

  const postInterjection = async (blob: Blob) => {
    setStreamState("processing");
    setCue(null);
    setCaption("");
    try {
      await stream.streamVoiceResponse(
        `/api/sessions/${sessionId}/interject`,
        blob,
      );
    } catch (error) {
      setStreamState("idle");
      toast({
        variant: "destructive",
        title: "The objection could not be put to the Bench",
        description: getErrorMessage(error),
      });
    }
  };

  useSpeechActivity(interrupter.stream, {
    enabled: listening,
    onSpeechStart: () => {
      if (bargingRef.current || streamState !== "playing") return;
      bargingRef.current = true;
      stream.stop(); // cut the audio mid-word
      setStreamState("interrupting");
    },
    onSpeechEnd: () => {
      if (!bargingRef.current) return;
      bargingRef.current = false;
      void interrupter.stopRecording().then((blob) => {
        if (blob.size > 0) void postInterjection(blob);
        else setStreamState("idle");
      });
    },
  });

  useEffect(() => {
    if (streamState !== "playing") return;
    let opened = true;
    interrupter.startRecording().catch(() => {
      // Barge-in is an enhancement. If the mic cannot be opened a second time
      // the turn still plays out and the student speaks when it finishes.
      opened = false;
    });
    return () => {
      // Playback ended without anyone interrupting: drop the capture.
      if (opened && !bargingRef.current) void interrupter.stopRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamState === "playing"]);

  // Track playback state changes to update our UI
  useEffect(() => {
    if (stream.playbackState === "playing") {
      setStreamState("playing");
    } else if (
      stream.playbackState === "ended" ||
      stream.playbackState === "idle"
    ) {
      if (streamState === "playing") {
        setStreamState("idle");
      }
    }
  }, [stream.playbackState, streamState]);

  const isRecording = recorder.state === "recording";
  const isProcessing = streamState === "processing";
  const isPlaying = streamState === "playing";
  const isInterrupting = streamState === "interrupting";

  // Read only — the amplitude shown while counsel is on their feet.
  const { level } = useSpeechActivity(recorder.stream, {
    enabled: isRecording,
  });

  const handleToggleRecord = async () => {
    if (recorder.state === "recording") {
      setStreamState("processing");
      try {
        const blob = await recorder.stopRecording();
        await stream.streamVoiceResponse(
          `/api/sessions/${sessionId}/voice-turns`,
          blob,
        );
      } catch (error) {
        setStreamState("idle");
        toast({
          variant: "destructive",
          title: "The microphone request failed",
          description: getErrorMessage(error),
        });
      }
    } else {
      try {
        setCue(null);
        setCaption("");
        setNote(null);
        await recorder.startRecording();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Microphone access is required",
          description: getErrorMessage(error),
        });
      }
    }
  };

  return (
    <div className="space-y-3">
      <Button
        onClick={handleToggleRecord}
        disabled={disabled || isProcessing || isPlaying || isInterrupting}
        className={cn(
          "h-11 w-full justify-center",
          isRecording && "bg-stamp text-stamp-foreground hover:bg-stamp/90",
        )}
      >
        {isRecording ? (
          <>
            <Square className="mr-2 h-3.5 w-3.5 fill-current" />
            Stop and submit
          </>
        ) : isProcessing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            The court is considering
          </>
        ) : isPlaying || isInterrupting ? (
          <>
            <Volume2 className="mr-2 h-4 w-4" />
            The court has the floor
          </>
        ) : (
          <>
            <Mic className="mr-2 h-4 w-4" />
            Begin speaking
          </>
        )}
      </Button>

      <div className="flex items-center justify-between gap-3">
        <LevelRule level={level} live={isRecording} />
        <span className="apparatus shrink-0 text-right text-muted-foreground">
          {isRecording
            ? "On your feet"
            : isProcessing
              ? "Working"
              : isInterrupting
                ? "Objection noted"
                : isPlaying
                  ? "Speak to interrupt"
                  : disabled
                    ? "Session closed"
                    : "Ready"}
        </span>
      </div>

      {isPlaying && cue && (
        <p className="apparatus text-primary">{speakerLabel(cue)} speaking</p>
      )}

      {note && (
        <p className="record-entry border-l-primary/40 py-1 font-serif text-sm leading-relaxed text-muted-foreground">
          {note}
        </p>
      )}

      {cue && <LiveCaption cue={cue} text={caption} />}
    </div>
  );
}

/**
 * What the court is saying, as it is said.
 *
 * Speech cannot carry the written record's warning badge, so where an agent
 * relied on a provision whose text has not been checked against
 * pakistancode.gov.pk, the caption says so beside the words being spoken.
 */
function LiveCaption({ cue, text }: { cue: SpeakerCue; text: string }) {
  const isObjection = cue.kind === "objection";
  const isRuling = cue.kind === "ruling";
  const hasUnverified = cue.grounded.some((provision) => !provision.verified);

  return (
    <div
      data-mark={isObjection ? "objection" : isRuling ? "ruling" : "bench"}
      className="record-entry py-2 pr-2"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={cn(
            "apparatus",
            isObjection ? "text-stamp" : isRuling ? "text-primary" : "text-foreground/70",
          )}
        >
          {speakerLabel(cue)}
          {isObjection ? " · objection" : ""}
          {isRuling && cue.ruling ? ` · ${cue.ruling}` : ""}
        </span>

        {cue.citation && (
          <span className="font-mono text-xs text-foreground/70">
            {cue.citation}
          </span>
        )}

        {hasUnverified && (
          <span
            className="apparatus text-stamp"
            title="This provision's text has not been checked against pakistancode.gov.pk. Do not quote it as authoritative."
          >
            ⚠ unverified
          </span>
        )}

        {cue.fabricated.length > 0 && (
          <span
            className="apparatus text-stamp"
            title={`Not found in the statute corpus: ${cue.fabricated.join(", ")}`}
          >
            ⚠ not in corpus: {cue.fabricated.join(", ")}
          </span>
        )}
      </div>

      {text && (
        <p className="mt-1.5 font-serif text-sm leading-relaxed text-foreground/85">
          {text}
        </p>
      )}

      {/* Shown open rather than collapsed: live, this is the bench reading
          statute while it speaks, and it is only on screen for the length of
          the ruling. The written record collapses the same trace, because
          there it is reference rather than event. */}
      {cue.reasoning.length > 0 && (
        <ol className="mt-2 space-y-1.5 border-l border-rule pl-3">
          {cue.reasoning.map((step, index) => (
            <li key={index} className="space-y-0.5">
              {step.action && (
                <p className="break-all font-mono text-[0.7rem] leading-snug text-primary">
                  {step.action}
                </p>
              )}
              {step.observation && (
                <p className="font-serif text-xs leading-snug text-foreground/55">
                  {step.observation}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
