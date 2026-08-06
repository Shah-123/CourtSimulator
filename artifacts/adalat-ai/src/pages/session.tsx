import { useLocation } from "wouter";
import {
  useGetSession,
  useAdvanceSessionPhase,
  useCallWitness,
  useListObjectionGrounds,
  useRaiseObjection,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetSessionQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VoiceControl } from "@/components/voice-control";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SessionPhase,
  SessionStatus,
  TurnSpeaker,
} from "@workspace/api-client-react";
import type { CourtReasoningStep } from "@workspace/api-client-react";
import { ChevronRight, UserPlus, Loader2, Gavel } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiErrorState, getErrorMessage } from "@/components/api-state";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const PHASE_LABELS: Record<string, string> = {
  opening: "Opening",
  witness_examination: "Examination-in-chief",
  cross_examination: "Cross-examination",
  closing: "Closing",
  verdict: "Verdict",
};

function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? phase.replace(/_/g, " ");
}

/** What a line of the record turns out to be, once its prefix is read. */
type Mark = "objection" | "ruling" | "counsel" | "bench" | "witness";

interface ParsedTurn {
  mark: Mark;
  speaker: string;
  /** Sits in the provenance rail, never inline with the spoken words. */
  citation: string | null;
  ground: string | null;
  ruling: "SUSTAINED" | "OVERRULED" | null;
  text: string;
  /** The bench's ReAct trace, when this turn is a ruling that used the tools. */
  reasoning: CourtReasoningStep[] | null;
}

function parseTurn(turn: {
  speaker: string;
  transcript: string;
  witnessName?: string | null;
  reasoning?: CourtReasoningStep[] | null;
}): ParsedTurn {
  const reasoning = turn.reasoning?.length ? turn.reasoning : null;
  const objection = turn.transcript.match(/^\[OBJECTION:\s*(.*?)\]\s*(.*)$/s);
  if (objection) {
    // recordEvent joins the ground label and the citation with an em dash.
    const [ground, citation] = objection[1].split("—").map((s) => s.trim());
    return {
      mark: "objection",
      speaker: "Opposing counsel",
      citation: citation || null,
      ground: ground || "Evidentiary objection",
      ruling: null,
      text: objection[2] ?? "",
      reasoning,
    };
  }

  const ruling = turn.transcript.match(
    /^\[RULING:\s*(SUSTAINED|OVERRULED)\]\s*(.*)$/s,
  );
  if (ruling) {
    return {
      mark: "ruling",
      speaker: "The Bench",
      citation: null,
      ground: null,
      ruling: ruling[1] as "SUSTAINED" | "OVERRULED",
      text: ruling[2] ?? "",
      reasoning,
    };
  }

  if (turn.speaker === TurnSpeaker.student) {
    return { mark: "counsel", speaker: "Counsel (you)", citation: null, ground: null, ruling: null, text: turn.transcript, reasoning };
  }
  if (turn.speaker === TurnSpeaker.judge) {
    return { mark: "bench", speaker: "The Bench", citation: null, ground: null, ruling: null, text: turn.transcript, reasoning };
  }
  if (turn.speaker === TurnSpeaker.opposing_counsel) {
    return { mark: "counsel", speaker: "Opposing counsel", citation: null, ground: null, ruling: null, text: turn.transcript, reasoning };
  }
  return {
    mark: "witness",
    speaker: turn.witnessName ? `Witness — ${turn.witnessName}` : "Witness",
    citation: null,
    ground: null,
    ruling: null,
    text: turn.transcript,
    reasoning,
  };
}

export default function SessionPage({ id }: { id: string }) {
  const sessionId = parseInt(id, 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    data: session,
    isLoading,
    isError,
    error,
    refetch,
  } = useGetSession(sessionId, {
    query: {
      queryKey: getGetSessionQueryKey(sessionId),
      enabled: Number.isInteger(sessionId) && sessionId > 0,
      refetchInterval: 3000,
    }, // Poll for updates in case transcript lags
  });

  // The record's provenance rail reads the corpus's own `verified` flag rather
  // than assuming. A citation the corpus does not confirm is marked unverified,
  // including one it has never heard of — the warning is never withheld on the
  // strength of a lookup miss.
  const { data: grounds = [] } = useListObjectionGrounds();
  const verifiedCitations = useMemo(
    () =>
      new Set(
        grounds.filter((g) => g.verified).map((g) => g.citation.trim()),
      ),
    [grounds],
  );

  const advancePhase = useAdvanceSessionPhase();
  const { toast } = useToast();

  // Auto-scroll to bottom of transcript
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector(
        "[data-radix-scroll-area-viewport]",
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [session?.turns.length]);

  useEffect(() => {
    if (session?.status === SessionStatus.completed) {
      setLocation(`/sessions/${sessionId}/verdict`);
    }
  }, [session?.status, sessionId, setLocation]);

  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return (
      <ApiErrorState error={new Error("This session address is invalid.")} />
    );
  }

  if (isError) {
    return <ApiErrorState error={error} onRetry={() => void refetch()} />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="apparatus text-muted-foreground">Opening the court</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  if (session.status === SessionStatus.completed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="apparatus">Reading the judgment</span>
      </div>
    );
  }

  const handleAdvancePhase = () => {
    const phases = Object.values(SessionPhase);
    const currentIndex = phases.indexOf(session.phase);
    const nextPhase = phases[currentIndex + 1];

    if (nextPhase) {
      advancePhase.mutate(
        { id: sessionId, data: { phase: nextPhase } },
        {
          onSuccess: (data) => {
            queryClient.setQueryData(getGetSessionQueryKey(sessionId), data);
            if (nextPhase === SessionPhase.verdict) {
              setLocation(`/sessions/${sessionId}/verdict`);
            }
          },
          onError: (error) => {
            toast({
              variant: "destructive",
              title: "The phase could not be advanced",
              description: getErrorMessage(error),
            });
          },
        },
      );
    }
  };

  const handleTurnComplete = () => {
    queryClient.invalidateQueries({
      queryKey: getGetSessionQueryKey(sessionId),
    });
  };

  const phases = Object.values(SessionPhase);
  const currentIndex = phases.indexOf(session.phase);

  return (
    <div className="flex min-h-[calc(100vh-9rem)] flex-col gap-5">
      {/* Case caption — how a court document announces itself. */}
      <header className="border-y border-rule bg-card/60 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="apparatus text-muted-foreground">
              In the matter of
            </p>
            {/* Wraps rather than truncates: a case name is how the matter is
                identified, and half of one identifies nothing. */}
            <h1 className="mt-1 text-balance font-serif text-2xl font-medium leading-tight tracking-tight sm:text-3xl">
              {session.case.title}
            </h1>
            <p className="apparatus mt-2 text-muted-foreground">
              {session.case.areaOfLaw}
              <span className="mx-2 text-rule">/</span>
              For the{" "}
              <span className="text-foreground">{session.studentSide}</span>
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <ObjectionDialog sessionId={sessionId} />

            {session.phase === SessionPhase.witness_examination ||
            session.phase === SessionPhase.cross_examination ? (
              <CallWitnessDialog
                sessionId={sessionId}
                witnesses={session.case.witnesses}
              />
            ) : null}

            <Button
              onClick={handleAdvancePhase}
              disabled={advancePhase.isPending}
            >
              {advancePhase.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {session.phase === SessionPhase.closing
                ? "Submit to the Bench"
                : "Next phase"}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* A trial is genuinely a sequence, so it is numbered like one. */}
        <ol className="mt-5 flex flex-wrap items-center gap-x-1 gap-y-2">
          {phases.map((phase, index) => {
            const isCurrent = index === currentIndex;
            const isPast = index < currentIndex;

            return (
              <li key={phase} className="flex items-center gap-1">
                <span
                  className={cn(
                    "apparatus rounded-sm px-2 py-1 transition-colors",
                    isCurrent && "bg-primary text-primary-foreground",
                    isPast && "text-muted-foreground line-through decoration-rule",
                    !isCurrent && !isPast && "text-muted-foreground/50",
                  )}
                >
                  <span className="tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="ml-2">{phaseLabel(phase)}</span>
                </span>
                {index < phases.length - 1 && (
                  <span aria-hidden="true" className="text-rule">
                    ·
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[1fr_20rem] xl:grid-cols-[1fr_23rem]">
        {/* The record */}
        <section className="flex min-h-[24rem] flex-col overflow-hidden rounded-md border border-card-border bg-card">
          <div className="flex shrink-0 items-baseline justify-between border-b border-rule px-4 py-2.5 sm:px-6">
            <h2 className="apparatus text-foreground">Record of proceedings</h2>
            <span className="apparatus tabular-nums text-muted-foreground">
              {session.turns.length}{" "}
              {session.turns.length === 1 ? "entry" : "entries"}
            </span>
          </div>

          <ScrollArea ref={scrollRef} className="flex-1">
            {session.turns.length === 0 ? (
              <div className="flex min-h-[20rem] flex-col items-center justify-center px-6 text-center">
                <Gavel className="h-7 w-7 text-primary/30" />
                <p className="mt-4 font-serif text-xl">
                  The court is in session.
                </p>
                <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                  Nothing has been said yet. Open your case aloud and the record
                  begins.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-rule/60">
                {session.turns.map((turn, index) => (
                  <RecordEntry
                    key={turn.id}
                    index={index + 1}
                    turn={parseTurn(turn)}
                    verifiedCitations={verifiedCitations}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </section>

        {/* The bar table: what counsel has in front of them. */}
        <aside className="flex flex-col gap-5">
          <div className="rounded-md border border-card-border bg-card p-5">
            <h2 className="apparatus text-muted-foreground">The floor</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Speak your argument. Interrupt the court to object.
            </p>
            <div className="mt-5">
              <VoiceControl
                sessionId={sessionId}
                onTurnComplete={handleTurnComplete}
              />
            </div>
          </div>

          <div className="rounded-md border border-card-border bg-card p-5">
            <h2 className="apparatus text-muted-foreground">Brief</h2>
            <p className="mt-2 font-serif text-[0.95rem] leading-relaxed text-foreground/85">
              {session.case.summary}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * One paragraph of the record.
 *
 * The provenance rail on the right is the point of the whole layout: every
 * provision an agent leant on is shown beside the words it produced, with its
 * verification state attached. The corpus has not been diffed against
 * pakistancode.gov.pk, so today every mark reads "unverified" — which is
 * exactly what a student needs to see before repeating any of it in a real
 * courtroom.
 */
function RecordEntry({
  index,
  turn,
  verifiedCitations,
}: {
  index: number;
  turn: ParsedTurn;
  verifiedCitations: Set<string>;
}) {
  const isVerified = turn.citation
    ? verifiedCitations.has(turn.citation.trim())
    : false;

  return (
    <article
      data-mark={turn.mark}
      className="record-entry mx-4 my-3 py-1 sm:mx-6"
    >
      <div className="grid gap-x-6 gap-y-2 lg:grid-cols-[10.5rem_1fr_9rem]">
        <div className="flex items-baseline gap-2 lg:flex-col lg:gap-1">
          <span className="apparatus tabular-nums text-muted-foreground/70">
            ¶{String(index).padStart(2, "0")}
          </span>
          <span
            className={cn(
              "apparatus",
              turn.mark === "objection" && "text-stamp",
              turn.mark === "ruling" && "text-primary",
              turn.mark === "witness" && "text-seal",
              (turn.mark === "counsel" || turn.mark === "bench") &&
                "text-foreground/70",
            )}
          >
            {turn.speaker}
          </span>
        </div>

        <div className="min-w-0">
          {turn.ground && (
            <p className="apparatus mb-1.5 text-stamp">
              Objection · {turn.ground}
            </p>
          )}
          {turn.ruling && (
            <p className="apparatus mb-1.5 text-primary">{turn.ruling}</p>
          )}
          <p className="font-serif text-[1.0625rem] leading-[1.65] text-foreground/90">
            {turn.text}
          </p>
          {turn.reasoning && <ReasoningTrace steps={turn.reasoning} />}
        </div>

        {/* Provenance rail */}
        <div className="flex flex-row flex-wrap items-start gap-x-3 gap-y-1 lg:flex-col lg:gap-1.5">
          {turn.citation && (
            <>
              <span className="font-mono text-xs text-foreground/70">
                {turn.citation}
              </span>
              <span
                className={cn(
                  "apparatus",
                  isVerified ? "text-seal" : "text-stamp",
                )}
                title={
                  isVerified
                    ? "Text confirmed against pakistancode.gov.pk"
                    : "This provision's text has not been checked against pakistancode.gov.pk. Do not quote it as authoritative."
                }
              >
                {isVerified ? "✓ verified" : "⚠ unverified"}
              </span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * The bench's working, shown under the ruling it produced.
 *
 * A ruling that merely asserts it is grounded is worth less than one that shows
 * what it read. The judge runs a bounded Thought→Action→Observation loop and
 * calls `search_statute` before ruling; every step of that is returned, and
 * until now none of it was ever displayed. It is collapsed by default because
 * the record should read as a record — the reasoning is available, not imposed.
 */
function ReasoningTrace({ steps }: { steps: CourtReasoningStep[] }) {
  return (
    <details className="group mt-3">
      <summary className="apparatus inline-flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground">
        <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
        How the Bench reached this
        <span className="tabular-nums text-muted-foreground/60">
          {steps.length} {steps.length === 1 ? "step" : "steps"}
        </span>
      </summary>

      <ol className="mt-2.5 space-y-3 border-l border-rule pl-4">
        {steps.map((step, index) => (
          <li key={index} className="space-y-1">
            <p className="apparatus text-muted-foreground/60">
              <span className="tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
            </p>
            {step.thought ? (
              <p className="font-serif text-sm italic leading-relaxed text-foreground/75">
                {step.thought}
              </p>
            ) : null}
            {step.action ? (
              <p className="break-all font-mono text-xs text-primary">
                {step.action}
              </p>
            ) : null}
            {step.observation ? (
              <p className="font-serif text-sm leading-relaxed text-foreground/60">
                {step.observation}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </details>
  );
}

function CallWitnessDialog({
  sessionId,
  witnesses,
}: {
  sessionId: number;
  witnesses: Array<{ name: string; role: string }>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [witness, setWitness] = useState<string>("");
  const callWitness = useCallWitness();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleCall = () => {
    if (!witness) return;
    callWitness.mutate(
      { id: sessionId, data: { witnessName: witness } },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetSessionQueryKey(sessionId), data);
          setIsOpen(false);
          setWitness("");
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "The witness could not be called",
            description: getErrorMessage(error),
          });
        },
      },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlus className="mr-2 h-4 w-4" /> Call witness
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            Call a witness to the stand
          </DialogTitle>
          <DialogDescription>
            Choose a witness from the case record to examine.
          </DialogDescription>
        </DialogHeader>
        <div className="py-3">
          <Select value={witness} onValueChange={setWitness}>
            <SelectTrigger>
              <SelectValue placeholder="Select a witness" />
            </SelectTrigger>
            <SelectContent>
              {witnesses.map((w) => (
                <SelectItem key={w.name} value={w.name}>
                  {w.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {w.role}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            onClick={handleCall}
            disabled={!witness || callWitness.isPending}
          >
            {callWitness.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Call to the stand
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ObjectionDialog({ sessionId }: { sessionId: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const [groundId, setGroundId] = useState<string>("");
  const [statement, setStatement] = useState<string>("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Grounds come from the statute corpus rather than a hardcoded list, so the
  // article number shown beside each ground is always one that exists.
  const { data: grounds = [], isLoading: groundsLoading } =
    useListObjectionGrounds();
  const selected = grounds.find((g) => g.id === groundId);

  const { mutateAsync: raiseObjection, isPending } = useRaiseObjection();

  const handleSubmit = async () => {
    if (!groundId) return;
    try {
      await raiseObjection({
        id: sessionId,
        data: { groundId, statement },
      });
      queryClient.invalidateQueries({
        queryKey: getGetSessionQueryKey(sessionId),
      });
      setIsOpen(false);
      setGroundId("");
      setStatement("");
      toast({
        title: "Objection put to the Bench",
        description: "The court is considering the ground you raised.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "The objection could not be put to the Bench",
        description: getErrorMessage(err),
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="border-stamp/40 bg-stamp-wash text-stamp hover:bg-stamp hover:text-stamp-foreground"
        >
          Object
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            Raise an objection
          </DialogTitle>
          <DialogDescription>
            Every ground below is drawn from the Qanun-e-Shahadat Order 1984 as
            it exists in this corpus. You cannot object on a ground the statute
            book does not contain.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <label
              htmlFor="objection-ground"
              className="apparatus text-muted-foreground"
            >
              Ground
            </label>
            <Select value={groundId} onValueChange={setGroundId}>
              <SelectTrigger id="objection-ground">
                <SelectValue
                  placeholder={
                    groundsLoading
                      ? "Reading the statute book…"
                      : "Choose a ground"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {grounds.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    <span className="flex flex-col py-0.5 text-left">
                      <span className="text-sm font-medium">
                        {g.label}
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {g.citation}
                        </span>
                      </span>
                      <span className="text-xs leading-snug text-muted-foreground">
                        {g.description}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selected && (
            <figure className="record-entry border-l-primary/40 bg-secondary/40 py-3 pr-3">
              <figcaption className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-foreground">
                  {selected.citation}
                </span>
                <span className="apparatus text-muted-foreground">
                  {selected.heading}
                </span>
                <span
                  className={cn(
                    "apparatus",
                    selected.verified ? "text-seal" : "text-stamp",
                  )}
                >
                  {selected.verified ? "✓ verified" : "⚠ unverified"}
                </span>
              </figcaption>
              <p className="mt-2 font-serif text-sm leading-relaxed text-foreground/85">
                {selected.content}
              </p>
              {!selected.verified && (
                <p className="mt-2 text-xs leading-relaxed text-stamp">
                  This text was written from model knowledge and has not been
                  diffed against pakistancode.gov.pk. Do not quote it verbatim
                  as authoritative.
                </p>
              )}
            </figure>
          )}

          <div className="space-y-2">
            <label
              htmlFor="objection-statement"
              className="apparatus text-muted-foreground"
            >
              What you will say (optional)
            </label>
            <textarea
              id="objection-statement"
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="My Lord, learned counsel is leading his own witness in chief…"
              className="min-h-[84px] w-full resize-none rounded-sm border border-input bg-background p-3 font-serif text-sm leading-relaxed focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setIsOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!groundId || isPending}
            className="bg-stamp text-stamp-foreground hover:bg-stamp/90"
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Gavel className="mr-2 h-4 w-4" />
            )}
            Put it to the Bench
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
