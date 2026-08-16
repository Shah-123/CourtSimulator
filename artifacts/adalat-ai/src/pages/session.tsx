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
import {
  ChevronRight,
  UserPlus,
  Loader2,
  Gavel,
  ShieldAlert,
  Scale,
  Users,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiErrorState, getErrorMessage } from "@/components/api-state";
import { CaseBriefArgument } from "@/components/case-brief";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const PHASE_LABELS: Record<string, string> = {
  opening: "Opening Submissions",
  witness_examination: "Examination-in-Chief",
  cross_examination: "Cross-Examination",
  closing: "Closing Arguments",
  verdict: "Judicial Verdict",
};

function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? phase.replace(/_/g, " ");
}

type Mark = "objection" | "ruling" | "counsel" | "bench" | "witness";

interface ParsedTurn {
  mark: Mark;
  speaker: string;
  citation: string | null;
  ground: string | null;
  ruling: "SUSTAINED" | "OVERRULED" | null;
  text: string;
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
    const [ground, citation] = objection[1].split("—").map((s) => s.trim());
    return {
      mark: "objection",
      speaker: "Opposing Counsel",
      citation: citation || null,
      ground: ground || "Evidentiary Objection",
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
      speaker: "The Presiding Bench",
      citation: null,
      ground: null,
      ruling: ruling[1] as "SUSTAINED" | "OVERRULED",
      text: ruling[2] ?? "",
      reasoning,
    };
  }

  if (turn.speaker === TurnSpeaker.student) {
    return {
      mark: "counsel",
      speaker: "Learned Counsel (You)",
      citation: null,
      ground: null,
      ruling: null,
      text: turn.transcript,
      reasoning,
    };
  }
  if (turn.speaker === TurnSpeaker.judge) {
    return {
      mark: "bench",
      speaker: "The Presiding Bench",
      citation: null,
      ground: null,
      ruling: null,
      text: turn.transcript,
      reasoning,
    };
  }
  if (turn.speaker === TurnSpeaker.opposing_counsel) {
    return {
      mark: "counsel",
      speaker: "Opposing Counsel",
      citation: null,
      ground: null,
      ruling: null,
      text: turn.transcript,
      reasoning,
    };
  }
  return {
    mark: "witness",
    speaker: turn.witnessName ? `Witness on Stand — ${turn.witnessName}` : "Witness",
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
  const [activeSideTab, setActiveSideTab] = useState<"floor" | "brief" | "witnesses" | "statutes">("floor");

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
    },
  });

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
      <ApiErrorState error={new Error("This courtroom address is invalid.")} />
    );
  }

  if (isError) {
    return <ApiErrorState error={error} onRetry={() => void refetch()} />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 bg-card p-8 rounded-sm border border-rule shadow-sm">
          <Gavel className="h-8 w-8 animate-bounce text-primary" />
          <p className="font-serif text-lg font-semibold">Convening the High Court Chamber</p>
          <p className="apparatus text-xs text-muted-foreground">Preparing docket and sworn statements...</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  if (session.status === SessionStatus.completed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="apparatus">Preparing judicial decree and grading...</span>
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
    <div className="flex min-h-[calc(100vh-9.5rem)] flex-col gap-4 pb-4">
      {/* Top Courtroom HUD Header */}
      <header className="rounded-sm border border-rule bg-card p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="apparatus text-primary font-bold">
                Docket No. AD-{session.id.toString().padStart(4, "0")}
              </span>
              <span className="text-rule">·</span>
              <span className="apparatus text-muted-foreground">
                {session.case.areaOfLaw}
              </span>
            </div>
            <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {session.case.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs">
              <span className="text-muted-foreground">Appearing for:</span>
              <span className="inline-flex items-center rounded-sm bg-primary/10 px-2 py-0.5 font-semibold text-primary border border-primary/20">
                {session.studentSide.toUpperCase()}
              </span>
              <span className="text-rule">·</span>
              <span className="font-mono text-[0.6875rem] text-muted-foreground truncate max-w-md">
                {session.case.applicableLaws}
              </span>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <ObjectionDialog sessionId={sessionId} />

            {(session.phase === SessionPhase.witness_examination ||
              session.phase === SessionPhase.cross_examination) && (
              <CallWitnessDialog
                sessionId={sessionId}
                witnesses={session.case.witnesses}
              />
            )}

            <Button
              onClick={handleAdvancePhase}
              disabled={advancePhase.isPending}
              className="gap-1.5 shadow-xs"
            >
              {advancePhase.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              <span>
                {session.phase === SessionPhase.closing
                  ? "Submit for Verdict"
                  : "Next Phase"}
              </span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 5-Stage Trial Phase Stepper */}
        <div className="mt-5 border-t border-rule/60 pt-3">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
            {phases.map((phase, index) => {
              const isCurrent = index === currentIndex;
              const isPast = index < currentIndex;

              return (
                <div
                  key={phase}
                  className={cn(
                    "flex items-center gap-2 rounded-sm px-2.5 py-1.5 transition-all text-xs",
                    isCurrent && "bg-primary text-primary-foreground font-semibold shadow-xs",
                    isPast && "bg-secondary/40 text-muted-foreground border border-rule/50",
                    !isCurrent && !isPast && "text-muted-foreground/50 opacity-70",
                  )}
                >
                  <span className="font-mono text-[0.6875rem] font-bold opacity-80">
                    0{index + 1}
                  </span>
                  <span className="truncate text-xs">{phaseLabel(phase)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Split Grid: Live Record & Bar Table Sidebar */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_22rem] xl:grid-cols-[1fr_25rem]">
        {/* Central Courtroom Record */}
        <section className="flex min-h-[28rem] flex-col overflow-hidden rounded-sm border border-card-border bg-card shadow-xs">
          <div className="flex shrink-0 items-center justify-between border-b border-rule px-4 py-3 sm:px-6 bg-secondary/15">
            <div className="flex items-center gap-2">
              <Gavel className="h-4 w-4 text-primary" />
              <h2 className="apparatus text-foreground font-bold">Record of Judicial Proceedings</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs text-seal font-mono">
                <span className="h-2 w-2 rounded-full bg-seal animate-pulse" />
                Live Chamber
              </span>
              <span className="apparatus tabular-nums text-muted-foreground text-xs">
                {session.turns.length} {session.turns.length === 1 ? "Entry" : "Entries"}
              </span>
            </div>
          </div>

          <ScrollArea ref={scrollRef} className="flex-1 p-2 sm:p-4">
            {session.turns.length === 0 ? (
              <div className="flex min-h-[24rem] flex-col items-center justify-center px-6 text-center">
                <div className="rounded-full bg-primary/10 p-4 border border-primary/20 mb-3">
                  <Gavel className="h-8 w-8 text-primary animate-pulse" />
                </div>
                <p className="font-serif text-xl font-semibold">The Court is in Formal Session</p>
                <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
                  The Bench is seated. Activate the microphone at the rostrum to deliver your opening submissions or state your appearances.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
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

        {/* Right Bar Table & Counsel's Desk */}
        <aside className="flex flex-col gap-4">
          {/* Voice Rostrum Control Card */}
          <div className="court-card p-4 space-y-3 bg-card shadow-xs">
            <div className="flex items-center justify-between border-b border-rule/60 pb-2">
              <h2 className="apparatus text-foreground font-bold flex items-center gap-1.5">
                <Scale className="h-4 w-4 text-primary" />
                Counsel's Rostrum
              </h2>
              <span className="apparatus text-muted-foreground text-[0.625rem]">Voice Engine</span>
            </div>
            <VoiceControl
              sessionId={sessionId}
              onTurnComplete={handleTurnComplete}
            />
          </div>

          {/* Quick Legal Reference Tabs */}
          <div className="court-card p-4 flex-1 flex flex-col bg-card shadow-xs">
            {/* Tab Selector */}
            <div className="flex border-b border-rule/70 gap-1 pb-2">
              <button
                onClick={() => setActiveSideTab("brief")}
                className={cn(
                  "apparatus px-2.5 py-1 rounded-sm text-xs transition-colors",
                  activeSideTab === "brief"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Pleading & Facts
              </button>
              <button
                onClick={() => setActiveSideTab("witnesses")}
                className={cn(
                  "apparatus px-2.5 py-1 rounded-sm text-xs transition-colors",
                  activeSideTab === "witnesses"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Witnesses ({session.case.witnesses?.length ?? 0})
              </button>
              <button
                onClick={() => setActiveSideTab("statutes")}
                className={cn(
                  "apparatus px-2.5 py-1 rounded-sm text-xs transition-colors",
                  activeSideTab === "statutes"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Statutes
              </button>
            </div>

            {/* Tab Content */}
            <div className="mt-3 flex-1 overflow-y-auto max-h-[300px] text-xs">
              {activeSideTab === "brief" && (
                <div className="space-y-3">
                  <p className="font-serif leading-relaxed text-foreground/90 bg-secondary/20 p-2.5 rounded-sm border border-rule/50">
                    {session.case.summary}
                  </p>
                  {session.case.brief && (
                    <CaseBriefArgument brief={session.case.brief} />
                  )}
                </div>
              )}

              {activeSideTab === "witnesses" && (
                <div className="space-y-2.5">
                  {session.case.witnesses?.map((w, idx) => (
                    <div key={idx} className="p-2.5 rounded-sm bg-secondary/30 border border-rule/60">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-semibold text-foreground">{w.name}</span>
                        <span className="apparatus text-[0.625rem] text-muted-foreground">{w.role}</span>
                      </div>
                      <p className="font-serif text-xs italic text-foreground/80">
                        "{w.statement}"
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {activeSideTab === "statutes" && (
                <div className="space-y-2">
                  <p className="apparatus text-muted-foreground">Applicable Legal Provisions:</p>
                  <div className="p-2.5 rounded-sm bg-secondary/20 border border-rule font-mono text-xs leading-relaxed">
                    {session.case.applicableLaws}
                  </div>
                  <p className="text-[0.6875rem] text-muted-foreground leading-snug">
                    All citations are evaluated by the Bench ReAct loop against the Pakistan Legal Corpus.
                  </p>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

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
      className={cn(
        "record-entry p-3 rounded-r-sm border-l-4 transition-all duration-150",
        turn.mark === "ruling" && "border-primary bg-primary/5 shadow-xs",
        turn.mark === "objection" && "border-stamp bg-stamp-wash/60",
        turn.mark === "witness" && "border-seal bg-seal-wash/40",
        turn.mark === "counsel" && "border-foreground/30 bg-card",
        turn.mark === "bench" && "border-primary/50 bg-secondary/20",
      )}
    >
      <div className="grid gap-x-4 gap-y-1.5 lg:grid-cols-[9.5rem_1fr_8rem]">
        {/* Speaker Info Column */}
        <div className="flex items-center lg:items-start gap-2 lg:flex-col lg:gap-0.5">
          <span className="apparatus tabular-nums text-muted-foreground/70 text-[0.625rem]">
            ¶{String(index).padStart(2, "0")}
          </span>
          <span
            className={cn(
              "apparatus font-bold text-xs",
              turn.mark === "objection" && "text-stamp",
              turn.mark === "ruling" && "text-primary",
              turn.mark === "witness" && "text-seal",
              turn.mark === "counsel" && "text-foreground",
              turn.mark === "bench" && "text-primary",
            )}
          >
            {turn.speaker}
          </span>
        </div>

        {/* Spoken Words Column */}
        <div className="min-w-0 space-y-1">
          {turn.ground && (
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-stamp" />
              <span className="apparatus text-stamp font-bold text-xs">
                Objection: {turn.ground}
              </span>
            </div>
          )}

          {turn.ruling && (
            <div className="my-1">
              <span
                className={cn(
                  turn.ruling === "SUSTAINED"
                    ? "judicial-stamp-sustained"
                    : "judicial-stamp-overruled",
                )}
              >
                <Gavel className="mr-1 h-3 w-3 inline" />
                RULING: {turn.ruling}
              </span>
            </div>
          )}

          <p className="font-serif text-sm sm:text-[0.95rem] leading-relaxed text-foreground">
            {turn.text}
          </p>

          {turn.reasoning && <ReasoningTrace steps={turn.reasoning} />}
        </div>

        {/* Citation Provenance Rail */}
        <div className="flex flex-row flex-wrap items-start justify-end gap-x-2 gap-y-1 lg:flex-col lg:items-end lg:gap-1">
          {turn.citation && (
            <>
              <span className="font-mono text-[0.6875rem] font-semibold text-foreground/80">
                {turn.citation}
              </span>
              <span
                className={cn(
                  "apparatus flex items-center gap-1 text-[0.625rem]",
                  isVerified ? "text-seal" : "text-stamp",
                )}
              >
                {isVerified ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 inline" />
                    Verified
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3 inline" />
                    Unverified
                  </>
                )}
              </span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function ReasoningTrace({ steps }: { steps: CourtReasoningStep[] }) {
  return (
    <details className="group mt-2 rounded-sm border border-rule/70 bg-card/70 p-2.5 text-xs">
      <summary className="apparatus inline-flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground font-semibold hover:text-foreground">
        <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90 text-primary" />
        <Sparkles className="h-3 w-3 text-primary" />
        <span>Judicial ReAct Deliberation</span>
        <span className="tabular-nums text-muted-foreground/70 font-normal">
          ({steps.length} {steps.length === 1 ? "step" : "steps"})
        </span>
      </summary>

      <ol className="mt-2.5 space-y-2 border-l-2 border-primary/30 pl-3">
        {steps.map((step, index) => (
          <li key={index} className="space-y-0.5">
            <p className="apparatus text-muted-foreground text-[0.625rem]">
              Step 0{index + 1}
            </p>
            {step.thought && (
              <p className="font-serif text-xs italic text-foreground/85">
                "{step.thought}"
              </p>
            )}
            {step.action && (
              <p className="font-mono text-[0.6875rem] text-primary font-semibold">
                → {step.action}
              </p>
            )}
            {step.observation && (
              <p className="font-serif text-[0.6875rem] text-foreground/70">
                Observation: {step.observation}
              </p>
            )}
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
        <Button variant="outline" size="sm" className="gap-1.5 border-seal/40 text-seal hover:bg-seal/10">
          <UserPlus className="h-4 w-4" />
          <span>Call Witness</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Users className="h-5 w-5 text-seal" />
            Call Witness to the Stand
          </DialogTitle>
          <DialogDescription className="text-xs">
            Select a sworn witness from the case record to examine or cross-examine under oath.
          </DialogDescription>
        </DialogHeader>
        <div className="py-3">
          <Select value={witness} onValueChange={setWitness}>
            <SelectTrigger>
              <SelectValue placeholder="Select a witness on record" />
            </SelectTrigger>
            <SelectContent>
              {witnesses.map((w) => (
                <SelectItem key={w.name} value={w.name}>
                  <span className="font-medium">{w.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">({w.role})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            onClick={handleCall}
            disabled={!witness || callWitness.isPending}
            className="gap-1.5"
          >
            {callWitness.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            <span>Summon to Stand</span>
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
        title: "Objection Registered with the Bench",
        description: "The Presiding Judge is evaluating the statutory ground.",
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
          size="sm"
          className="border-stamp/40 bg-stamp-wash text-stamp hover:bg-stamp hover:text-stamp-foreground gap-1.5"
        >
          <ShieldAlert className="h-4 w-4" />
          <span>Object</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2 text-stamp">
            <ShieldAlert className="h-5 w-5" />
            Raise Evidentiary Objection
          </DialogTitle>
          <DialogDescription className="text-xs">
            Every ground is anchored in the Qanun-e-Shahadat Order 1984 (QSO) or procedural codes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <label
              htmlFor="objection-ground"
              className="apparatus text-muted-foreground"
            >
              Statutory Ground
            </label>
            <Select value={groundId} onValueChange={setGroundId}>
              <SelectTrigger id="objection-ground">
                <SelectValue
                  placeholder={
                    groundsLoading
                      ? "Loading grounds from QSO 1984..."
                      : "Choose a ground of objection"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {grounds.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    <span className="flex flex-col py-0.5 text-left">
                      <span className="text-sm font-medium">
                        {g.label}
                        <span className="ml-2 font-mono text-xs text-primary font-bold">
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
            <figure className="record-entry border-l-primary bg-secondary/30 p-3 rounded-r-sm space-y-1.5">
              <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-rule/50 pb-1">
                <span className="font-mono text-xs font-bold text-foreground">
                  {selected.citation}
                </span>
                <span
                  className={cn(
                    "apparatus",
                    selected.verified ? "text-seal" : "text-stamp",
                  )}
                >
                  {selected.verified ? "✓ Verified Statute" : "⚠ Statutory Reference"}
                </span>
              </figcaption>
              <p className="font-serif text-xs leading-relaxed text-foreground/85">
                {selected.content}
              </p>
            </figure>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="objection-statement"
              className="apparatus text-muted-foreground"
            >
              Counsel's Oral Objection (Optional)
            </label>
            <textarea
              id="objection-statement"
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="My Lord, learned counsel is leading the witness in examination-in-chief contrary to Article 133 QSO..."
              className="min-h-[80px] w-full resize-none rounded-sm border border-input bg-background p-2.5 font-serif text-xs leading-relaxed focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
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
            className="bg-stamp text-stamp-foreground hover:bg-stamp/90 gap-1.5"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Gavel className="h-4 w-4" />
            )}
            <span>Put Objection to Bench</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
