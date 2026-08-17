import { useParams, Link } from "wouter";
import {
  getGetSessionQueryKey,
  getGetSessionVerdictQueryKey,
  SessionStatus,
  useGetSession,
  useGetSessionVerdict,
} from "@workspace/api-client-react";
import {
  ChevronLeft,
  Gavel,
  Award,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  BookOpen,
  Scale,
  FileCheck2,
} from "lucide-react";
import { ApiErrorState } from "@/components/api-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function VerdictPage() {
  const { id } = useParams();
  const sessionId = parseInt(id || "0", 10);
  const {
    data: session,
    isLoading: isSessionLoading,
    isError: isSessionError,
    error: sessionError,
    refetch: refetchSession,
  } = useGetSession(sessionId, {
    query: {
      queryKey: getGetSessionQueryKey(sessionId),
      enabled: Number.isInteger(sessionId) && sessionId > 0,
    },
  });

  const {
    data: verdict,
    isLoading: isVerdictLoading,
    isError: isVerdictError,
    error: verdictError,
    refetch: refetchVerdict,
  } = useGetSessionVerdict(sessionId, {
    query: {
      queryKey: getGetSessionVerdictQueryKey(sessionId),
      enabled:
        Number.isInteger(sessionId) &&
        sessionId > 0 &&
        session?.status === SessionStatus.completed,
    },
  });

  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return (
      <ApiErrorState error={new Error("This verdict address is invalid.")} />
    );
  }

  if (isSessionError || isVerdictError) {
    return (
      <ApiErrorState
        error={sessionError ?? verdictError}
        onRetry={() => {
          void refetchSession();
          void refetchVerdict();
        }}
        title="The verdict could not be loaded"
      />
    );
  }

  if (isSessionLoading || isVerdictLoading) {
    return (
      <div className="mx-auto max-w-3xl animate-pulse space-y-6 py-12">
        <div className="h-6 w-32 rounded-sm bg-secondary" />
        <div className="h-48 rounded-sm bg-card border border-rule" />
        <div className="h-32 rounded-sm bg-card border border-rule" />
        <div className="h-48 rounded-sm bg-card border border-rule" />
      </div>
    );
  }

  if (!session || !verdict) {
    return (
      <div className="mx-auto max-w-lg py-24 text-center">
        <div className="rounded-full bg-primary/10 p-4 w-16 h-16 mx-auto flex items-center justify-center mb-4">
          <Gavel className="h-8 w-8 text-primary" />
        </div>
        <h2 className="font-serif text-2xl font-bold text-foreground">No Final Decree on File</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          The Presiding Bench delivers a recorded judgment once the hearing concludes. This proceeding is currently part-heard.
        </p>
        <Link
          href={`/sessions/${sessionId}`}
          className="apparatus mt-6 inline-flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm"
        >
          Return to Courtroom Chamber
        </Link>
      </div>
    );
  }

  const criteria = [
    { label: "Legal Reasoning & Statutory Application", score: verdict.legalReasoningScore },
    { label: "Persuasiveness & Oral Delivery", score: verdict.persuasivenessScore },
    { label: "Procedural Command & Objections", score: verdict.procedureScore },
    { label: "Factual Matrix Command & Sworn Record", score: verdict.factualCommandScore },
  ];

  const isDistinction = verdict.overallScore >= 75;
  const isPass = verdict.overallScore >= 50;

  return (
    <div className="mx-auto max-w-3xl pb-20 space-y-8">
      {/* Navigation breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/history"
          className="apparatus inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground text-xs"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Return to Cause List
        </Link>

        <Link href="/">
          <Button variant="outline" size="sm" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            <span>Select Next Matter</span>
          </Button>
        </Link>
      </div>

      {/* Official Judicial Decree Document */}
      <div className="court-card p-6 sm:p-10 space-y-8 bg-card border-2 border-rule relative overflow-hidden shadow-md">
        {/* Document Header */}
        <header className="border-b-2 border-foreground/80 pb-6 text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 border border-primary/30 text-primary mb-2">
            <Gavel className="h-6 w-6" />
          </div>
          <p className="apparatus text-muted-foreground tracking-widest text-[0.6875rem]">
            IN THE HIGH COURT OF SINDH / SUPREME COURT OF PAKISTAN
          </p>
          <h1 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
            Judicial Decree & Bench Evaluation
          </h1>
          <p className="apparatus text-xs text-muted-foreground pt-1">
            Docket No. AD-{session.id.toString().padStart(4, "0")} · {session.case.areaOfLaw}
          </p>
          <div className="pt-2 text-sm font-serif italic text-foreground/85 max-w-xl mx-auto">
            In the Matter of: <strong className="font-semibold">{session.case.title}</strong>
          </div>
          <p className="apparatus text-xs text-primary font-bold">
            Appearing as Counsel for the {session.studentSide.toUpperCase()}
          </p>
        </header>

        {/* Scorecard Hero */}
        <section className="flex flex-col items-center justify-center py-6 bg-secondary/25 rounded-sm border border-rule text-center">
          <p className="apparatus text-muted-foreground text-xs font-semibold">
            Overall Advocacy Score
          </p>
          <div className="mt-2 flex items-baseline gap-1">
            <span
              className={cn(
                "font-serif text-7xl font-extrabold tabular-nums tracking-tight",
                isDistinction ? "text-seal" : isPass ? "text-primary" : "text-stamp",
              )}
            >
              {verdict.overallScore}
            </span>
            <span className="font-serif text-2xl text-muted-foreground">/100</span>
          </div>

          <div className="mt-3">
            <span
              className={cn(
                "judicial-stamp text-xs px-3 py-1",
                isDistinction
                  ? "judicial-stamp-sustained"
                  : isPass
                  ? "border-primary text-primary bg-primary/10"
                  : "judicial-stamp-overruled",
              )}
            >
              <Award className="h-3.5 w-3.5 mr-1.5 inline" />
              {isDistinction
                ? "First Class Distinction"
                : isPass
                ? "Qualified Appearance"
                : "Further Preparation Required"}
            </span>
          </div>
        </section>

        {/* Remarks from the Bench */}
        <section className="space-y-2.5">
          <h2 className="apparatus text-foreground font-bold flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            Remarks from the Presiding Bench
          </h2>
          <blockquote className="border-l-4 border-primary bg-primary/5 p-4 rounded-r-sm font-serif text-base sm:text-lg italic leading-relaxed text-foreground">
            "{verdict.judgeRemarks}"
          </blockquote>
        </section>

        {/* Strengths & Areas for Improvement Grid */}
        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Strengths */}
          <div className="p-4 rounded-sm bg-seal-wash/50 border border-seal/30 space-y-2">
            <h3 className="apparatus text-seal font-bold flex items-center gap-1.5 text-xs">
              <CheckCircle2 className="h-4 w-4" />
              Commendations & Strengths
            </h3>
            <p className="font-serif text-xs sm:text-sm leading-relaxed text-foreground/90">
              {verdict.strengths}
            </p>
          </div>

          {/* Areas for Improvement */}
          <div className="p-4 rounded-sm bg-stamp-wash/50 border border-stamp/30 space-y-2">
            <h3 className="apparatus text-stamp font-bold flex items-center gap-1.5 text-xs">
              <AlertTriangle className="h-4 w-4" />
              Areas for Judicial Correction
            </h3>
            <p className="font-serif text-xs sm:text-sm leading-relaxed text-foreground/90">
              {verdict.areasForImprovement}
            </p>
          </div>
        </section>

        {/* Detailed Rubric by Criterion */}
        <section className="space-y-4 pt-2">
          <h2 className="apparatus text-foreground font-bold flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-primary" />
            Evaluation by Statutory Criterion
          </h2>
          <div className="divide-y divide-rule/70 border-y border-rule/70">
            {criteria.map(({ label, score }) => (
              <div key={label} className="py-3.5 space-y-1.5">
                <div className="flex justify-between items-center text-xs sm:text-sm">
                  <span className="font-semibold text-foreground">{label}</span>
                  <span className="apparatus font-bold tabular-nums text-foreground">
                    {score}/100
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      score >= 75 ? "bg-seal" : score >= 50 ? "bg-primary" : "bg-stamp",
                    )}
                    style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Footer Notice */}
        <footer className="border-t border-rule pt-4 text-center">
          <p className="apparatus text-[0.625rem] text-muted-foreground leading-relaxed">
            Evaluated by the CourtSimulator Judicial Deliberation Graph against the Record of Proceedings and the statutory corpus of Pakistan.
          </p>
        </footer>
      </div>
    </div>
  );
}
