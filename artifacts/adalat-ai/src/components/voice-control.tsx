import { useState, useEffect, useRef } from "react";
import {
  useVoiceRecorder,
  useVoiceStream,
  useSpeechActivity,
  type AppEvent,
} from "@workspace/integrations-openai-ai-react/audio";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2, Volume2, Radio, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/components/api-state";
import {
  LiveCaption,
  speakerLabel,
  type SpeakerCue,
} from "@/components/live-caption";
import { useToast } from "@/hooks/use-toast";

interface VoiceRecorderProps {
  sessionId: number;
  onTurnComplete: () => void;
  disabled?: boolean;
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

const TICKS = 32;

function LevelRule({ level, live }: { level: number; live: boolean }) {
  const lit = live ? Math.min(TICKS, Math.round((level / 0.22) * TICKS)) : 0;

  return (
    <div
      className="flex h-5 items-end gap-[3px] bg-secondary/30 px-2 py-1 rounded-sm border border-rule/50 w-full justify-between"
      role="presentation"
      aria-hidden="true"
    >
      {Array.from({ length: TICKS }, (_, i) => (
        <span
          key={i}
          className={cn(
            "w-[2px] rounded-full transition-all duration-75",
            i < lit
              ? i > TICKS * 0.75
                ? "bg-stamp"
                : i > TICKS * 0.4
                ? "bg-primary"
                : "bg-seal"
              : "bg-rule/70",
          )}
          style={{ height: i < lit ? `${35 + (i / TICKS) * 65}%` : "20%" }}
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
  const interrupter = useVoiceRecorder();
  const { toast } = useToast();

  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const workletUrl = `${baseUrl}/audio-playback-worklet.js`;

  const stream = useVoiceStream({
    workletPath: workletUrl,
    onEvent: (event) => {
      const next = parseSpeakerCue(event);
      if (next) {
        setCue(next);
        setCaption("");
        setNote(null);
        return;
      }
      if (event.type === "note" && typeof event.data === "string") {
        setNote(event.data);
      }
    },
    onTranscript: (delta) => setCaption((text) => text + delta),
    onComplete: () => {
      setStreamState("idle");
      onTurnComplete();
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
      stream.stop();
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
      opened = false;
    });
    return () => {
      if (opened && !bargingRef.current) void interrupter.stopRecording();
    };
  }, [streamState === "playing"]);

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
    <div className="space-y-4">
      {/* Dynamic Action Button */}
      <Button
        onClick={handleToggleRecord}
        disabled={disabled || isProcessing || isPlaying || isInterrupting}
        className={cn(
          "h-12 w-full justify-center text-sm font-semibold transition-all duration-200 shadow-sm",
          isRecording
            ? "bg-stamp text-stamp-foreground hover:bg-stamp/90 animate-pulse border-2 border-stamp/40"
            : isProcessing
            ? "bg-secondary text-foreground"
            : isPlaying
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {isRecording ? (
          <>
            <Square className="mr-2 h-4 w-4 fill-current text-stamp-foreground" />
            <span>Finish Argument & Yield to Bench</span>
          </>
        ) : isProcessing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
            <span>The Bench is Considering...</span>
          </>
        ) : isPlaying || isInterrupting ? (
          <>
            <Volume2 className="mr-2 h-4 w-4 animate-bounce" />
            <span>Court Floor Active (Speak to Object)</span>
          </>
        ) : (
          <>
            <Mic className="mr-2 h-4 w-4" />
            <span>Take Rostrum (Speak Argument)</span>
          </>
        )}
      </Button>

      {/* Voice Activity Level Visualizer */}
      <div className="space-y-1.5">
        <LevelRule level={level} live={isRecording} />
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-mono text-[0.6875rem] text-muted-foreground">
            {isRecording ? (
              <span className="flex items-center gap-1 text-stamp font-semibold">
                <Radio className="h-3 w-3 animate-ping text-stamp" />
                Mic Active · Record Open
              </span>
            ) : isProcessing ? (
              <span className="flex items-center gap-1 text-primary font-semibold">
                <Activity className="h-3 w-3 animate-spin text-primary" />
                Bench Deliberating
              </span>
            ) : isPlaying ? (
              <span className="flex items-center gap-1 text-seal font-semibold">
                <Volume2 className="h-3 w-3 text-seal" />
                Audio Streaming
              </span>
            ) : (
              <span className="text-muted-foreground">Rostrum Ready</span>
            )}
          </span>
          <span className="apparatus text-muted-foreground text-[0.625rem]">
            {isRecording
              ? "Speaking"
              : isProcessing
              ? "Analyzing"
              : isPlaying
              ? "Barge-in enabled"
              : disabled
              ? "Session Concluded"
              : "Ready"}
          </span>
        </div>
      </div>

      {isPlaying && cue && (
        <div className="flex items-center gap-2 p-2 rounded-sm bg-primary/10 border border-primary/20">
          <Volume2 className="h-4 w-4 text-primary shrink-0 animate-pulse" />
          <p className="apparatus text-primary font-bold text-xs truncate">
            {speakerLabel(cue)} is addressing the courtroom
          </p>
        </div>
      )}

      {note && (
        <p className="record-entry border-l-primary/60 bg-secondary/30 p-2 font-serif text-xs leading-relaxed text-muted-foreground rounded-r-sm">
          {note}
        </p>
      )}

      {cue && <LiveCaption cue={cue} text={caption} />}
    </div>
  );
}
