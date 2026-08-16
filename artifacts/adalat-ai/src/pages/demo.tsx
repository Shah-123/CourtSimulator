import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, RotateCcw, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { LiveCaption, type SpeakerCue } from "@/components/live-caption";
import fixture from "@/data/demo-run.json";

/**
 * A recorded run, replayed from a fixture.
 *
 * This exists because a live demo depends on three things that have each failed
 * already: venue network, an API balance, and a microphone that has never been
 * proven. What it does *not* do is stage the courtroom — every agent line here
 * was produced by the real graph during `pnpm run capture-demo` and written down
 * verbatim. That distinction is the whole point, so the banner naming this a
 * recording is not dismissible and not configurable.
 *
 * Deliberately its own route rather than a mode on the session page: a recording
 * that can be mistaken for a live session is worse than no recording.
 */

const AUDIO_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/demo`;

/** How long a line stays on screen when it has no audio file yet. */
const SILENT_LINE_MS = 4200;

interface CapturedTurn {
  id: string;
  speaker: string;
  kind: string | null;
  witnessName: string | null;
  transcript: string;
  citation: string | null;
  ruling: string | null;
  grounded: { citation: string; heading: string; verified: boolean }[];
  reasoning: { thought: string; action: string; observation: string }[];
}

interface CapturedExchange {
  beat: number;
  phase: string;
  intent: string;
  witnessOnStand: string | null;
  counsel: CapturedTurn;
  events: CapturedTurn[];
  agentFabricated: string[];
  citationAccuracy: number | null;
}

/** One line of the run, flattened for sequential playback. */
interface PlaybackLine {
  turn: CapturedTurn;
  exchange: CapturedExchange;
  isCounsel: boolean;
}

const PHASE_LABEL: Record<string, string> = {
  opening: "Opening",
  witness_examination: "Examination-in-chief",
  cross_examination: "Cross-examination",
  closing: "Closing",
  verdict: "Verdict",
};

export default function DemoPage() {
  const exchanges = (fixture.exchanges ?? []) as unknown as CapturedExchange[];
  const capturedAt = fixture.capturedAt as string | null;

  const lines = useMemo<PlaybackLine[]>(
    () =>
      exchanges.flatMap((exchange) => [
        { turn: exchange.counsel, exchange, isCounsel: true },
        ...exchange.events.map((turn) => ({
          turn,
          exchange,
          isCounsel: false,
        })),
      ]),
    [exchanges],
  );

  // `revealed` is how many lines are on the record; the line being spoken is
  // therefore the last revealed one. `mode` is what the room is doing: waiting
  // for counsel to finish speaking, or playing the court's answer.
  const [revealed, setRevealed] = useState(0);
  const [mode, setMode] = useState<"await" | "play" | "done">("await");
  const [showMyLine, setShowMyLine] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speaking = revealed > 0 ? lines[revealed - 1] : null;
  const pending = lines[revealed] ?? null;
  const awaiting = mode === "await" && pending !== null;

  // Which exchange the header describes: the one counsel is about to open while
  // waiting, otherwise the one being spoken. Reading it off `speaking` alone
  // would leave the header a phase behind whenever the floor returns.
  const context = (awaiting ? pending : speaking)?.exchange ??
    lines[0].exchange;

  /** After the court finishes a line: keep going, or hand the floor back. */
  const continueRun = () => {
    const next = lines[revealed];
    if (!next) {
      setMode("done");
      return;
    }
    if (next.isCounsel) {
      // The floor returns to counsel. Nothing advances until they say so.
      setMode("await");
      return;
    }
    setRevealed((r) => r + 1);
  };

  /** Counsel has finished speaking: put their line on the record and reply. */
  const deliver = () => {
    if (!pending) return;
    setShowMyLine(false);
    setRevealed((r) => r + 1);
    setMode("play");
  };

  // Drives the court's answer. A counsel line has no audio, so revealing one
  // falls straight through to the next line; an agent line plays and hands back
  // on `ended`. The timer is the fallback for a line that has not been voiced
  // yet, so the run is presentable before the whole audio set exists.
  useEffect(() => {
    if (mode !== "play" || !speaking) return;

    if (speaking.isCounsel) {
      continueRun();
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) continueRun();
    }, SILENT_LINE_MS);

    audio.currentTime = 0;
    const played = audio.play();
    if (played) {
      played
        .then(() => window.clearTimeout(timer))
        .catch(() => {
          // No file for this line, or autoplay refused. The timer carries it.
        });
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      audio.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, revealed]);

  // Space advances. Counsel should be arguing to the room, not hunting for a
  // button, and the default scroll-on-space would move the record underneath
  // them mid-sentence.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|BUTTON)$/.test(target.tagName)) return;
      event.preventDefault();
      if (mode === "await") deliver();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, revealed]);

  if (lines.length === 0) {
    return <NothingCaptured />;
  }

  return (
    <div className="mx-auto max-w-4xl pb-20">
      <RecordedBanner capturedAt={capturedAt} />

      <header className="mt-8 border-b border-rule pb-6">
        <p className="apparatus text-muted-foreground">
          {PHASE_LABEL[context.phase] ?? context.phase}
          {context.witnessOnStand
            ? ` · ${context.witnessOnStand} on the stand`
            : ""}
        </p>
        <h1 className="mt-2 font-serif text-3xl font-medium tracking-tight">
          {(fixture.case as { title?: string } | null)?.title ??
            "Recorded proceedings"}
        </h1>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button onClick={deliver} disabled={!awaiting}>
          <Play className="mr-2 h-4 w-4" />
          {mode === "done"
            ? "The hearing is concluded"
            : awaiting
              ? "I have finished — let the court respond"
              : "The court is speaking"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setRevealed(0);
            setMode("await");
            setShowMyLine(false);
          }}
        >
          <RotateCcw className="mr-2 h-4 w-4" /> Restart
        </Button>
        <span className="apparatus ml-auto tabular-nums text-muted-foreground">
          {revealed} / {lines.length}
        </span>
      </div>

      {/* One element, re-pointed per line: a fresh <audio> per turn would
          re-mount mid-run and drop playback on the line being spoken. */}
      <audio
        ref={audioRef}
        src={
          speaking && !speaking.isCounsel
            ? `${AUDIO_BASE}/${speaking.turn.id}.mp3`
            : undefined
        }
        onEnded={continueRun}
        preload="auto"
      />

      <div className="mt-8 space-y-4">
        {lines.slice(0, revealed).map((line, i) => (
          <TurnBlock
            key={line.turn.id}
            line={line}
            isCurrent={i === revealed - 1 && mode !== "await"}
          />
        ))}
      </div>

      {awaiting && pending?.isCounsel ? (
        <CounselCue
          text={pending.turn.transcript}
          shown={showMyLine}
          onToggle={() => setShowMyLine((s) => !s)}
        />
      ) : null}

      {mode === "done" && fixture.verdict ? (
        <VerdictBlock verdict={fixture.verdict} />
      ) : null}
    </div>
  );
}

function RecordedBanner({ capturedAt }: { capturedAt: string | null }) {
  return (
    <div className="border border-stamp/40 bg-stamp-wash/40 px-5 py-4">
      <p className="apparatus text-stamp">Recorded run — not live</p>
      <p className="mt-1.5 font-serif text-[0.9375rem] leading-relaxed text-foreground/80">
        Every line below was produced by the courtroom agents during a real
        session
        {capturedAt
          ? ` captured on ${new Date(capturedAt).toLocaleDateString(undefined, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}`
          : ""}
        , and is replayed here from a stored transcript. Nothing on this page
        calls a model, a database, or the network.
      </p>
    </div>
  );
}

/**
 * The floor is counsel's. The page waits here.
 *
 * Deliberately does *not* show the line by default. The whole reason for
 * presenting live rather than playing a recording is that the advocate is seen
 * to know the case; a script on the projection undoes that, and the audience
 * reads the room's screen whether or not it is meant for them. The line joins
 * the visible record once it has actually been said.
 *
 * The escape hatch stays, because losing your place in front of a panel is a
 * worse outcome than a glance at a prompt — it is just off by default, and
 * resets between exchanges so it cannot be left open by accident.
 */
function CounselCue({
  text,
  shown,
  onToggle,
}: {
  text: string;
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mt-6 border-l-2 border-primary/50 bg-secondary/30 py-4 pl-5 pr-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="apparatus text-primary">
          Counsel addresses the court
        </span>
        <span className="apparatus text-muted-foreground">
          press space when you have finished
        </span>
        <button
          type="button"
          onClick={onToggle}
          className="apparatus ml-auto inline-flex items-center gap-1.5 text-muted-foreground/70 underline-offset-4 hover:text-foreground hover:underline"
        >
          {shown ? (
            <>
              <EyeOff className="h-3 w-3" /> hide my line
            </>
          ) : (
            <>
              <Eye className="h-3 w-3" /> show my line
            </>
          )}
        </button>
      </div>

      {shown && (
        <p className="mt-3 font-serif text-sm leading-relaxed text-foreground/70">
          {text}
        </p>
      )}
    </div>
  );
}

function TurnBlock({
  line,
  isCurrent,
}: {
  line: PlaybackLine;
  isCurrent: boolean;
}) {
  const { turn, exchange, isCounsel } = line;

  return (
    <div className={cn("transition-opacity", isCurrent ? "" : "opacity-55")}>
      {isCounsel ? (
        <div className="record-entry py-2 pr-2" data-mark="counsel">
          <span className="apparatus text-primary">Counsel</span>
          <p className="mt-1.5 font-serif text-sm leading-relaxed text-foreground/85">
            {turn.transcript}
          </p>
        </div>
      ) : (
        <LiveCaption
          cue={toCue(turn, exchange)}
          text={turn.transcript}
        />
      )}
    </div>
  );
}

/**
 * Adapts a captured turn to the shape the live caption renders.
 *
 * `agentFabricated` is recorded per exchange rather than per line — the batch
 * turn endpoint audits the whole exchange at once — so it is attached to the
 * agent lines of that exchange. Over-attributing a warning is the safe
 * direction: it can only ever show a caution that belongs to the same
 * exchange, never hide one.
 */
function toCue(turn: CapturedTurn, exchange: CapturedExchange): SpeakerCue {
  const speaker =
    turn.speaker === "judge" ||
    turn.speaker === "opposing_counsel" ||
    turn.speaker === "witness"
      ? turn.speaker
      : "judge";

  return {
    speaker,
    kind: (turn.kind as SpeakerCue["kind"]) ?? "bench",
    witnessName: turn.witnessName,
    citation: turn.citation,
    ruling: (turn.ruling as SpeakerCue["ruling"]) ?? null,
    grounded: turn.grounded ?? [],
    fabricated: exchange.agentFabricated ?? [],
    reasoning: turn.reasoning ?? [],
  };
}

function VerdictBlock({ verdict }: { verdict: unknown }) {
  const v = verdict as Record<string, unknown> | null;
  if (!v) return null;

  const scores: [string, unknown][] = [
    ["Legal reasoning", v.legalReasoningScore],
    ["Persuasiveness", v.persuasivenessScore],
    ["Procedure", v.procedureScore],
    ["Factual command", v.factualCommandScore],
    ["Citation accuracy", v.citationAccuracy],
  ];

  return (
    <section className="mt-12 border-t border-rule pt-8">
      <h2 className="font-serif text-2xl">The scorecard</h2>
      <div className="mt-5 grid grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-5">
        {scores.map(([label, value]) => (
          <div key={label} className="bg-card px-4 py-4">
            <p className="apparatus text-muted-foreground">{label}</p>
            <p className="mt-1.5 font-serif text-2xl tabular-nums leading-none">
              {value === null || value === undefined ? "—" : String(value)}
            </p>
          </div>
        ))}
      </div>
      {typeof v.feedback === "string" && v.feedback ? (
        <p className="mt-5 font-serif leading-relaxed text-foreground/80">
          {v.feedback}
        </p>
      ) : null}

      <CitationLedger checks={v.citationChecks} />
    </section>
  );
}

/**
 * Every provision counsel put on the record, checked against the corpus.
 *
 * This is where the fabricated-citation beat actually lands. Whether the bench
 * happens to repeat a made-up section while rejecting it varies between runs,
 * so the in-exchange warning cannot be relied on to appear — but the session
 * audit always names it, because it is computed over the whole record rather
 * than over one agent's phrasing.
 */
function CitationLedger({ checks }: { checks: unknown }) {
  if (!Array.isArray(checks) || checks.length === 0) return null;
  const rows = checks as {
    raw: string;
    citation: string | null;
    status: string;
    heading: string | null;
  }[];

  return (
    <div className="mt-8">
      <h3 className="apparatus text-muted-foreground">Citations on the record</h3>
      <ul className="mt-3 divide-y divide-rule/70 border-y border-rule">
        {rows.map((check, i) => {
          const found = check.status === "verified";
          return (
            <li
              key={`${check.raw}-${i}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5"
            >
              <span
                className={cn(
                  "apparatus shrink-0",
                  found ? "text-seal" : "text-stamp",
                )}
              >
                {found ? "✓ in corpus" : "⚠ not in corpus"}
              </span>
              <span className="font-mono text-xs text-foreground/70">
                {check.citation ?? "—"}
              </span>
              <span className="font-serif text-sm text-foreground/75">
                {check.heading ?? check.raw}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NothingCaptured() {
  return (
    <div className="mx-auto max-w-2xl py-24 text-center">
      <h1 className="font-serif text-3xl font-medium tracking-tight">
        No run has been captured yet.
      </h1>
      <p className="mt-4 leading-relaxed text-muted-foreground">
        This page replays a real session rather than a scripted one, so it stays
        empty until a run exists. Start both services, then record one:
      </p>
      <pre className="mt-6 inline-block border border-rule bg-secondary/40 px-4 py-3 text-left font-mono text-sm">
        pnpm run dev:all{"\n"}
        pnpm run capture-demo
      </pre>
      <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
        The capture makes real model calls — about $0.10 for the full run — and
        writes both the transcript this page reads and the list of lines to
        voice.
      </p>
    </div>
  );
}
