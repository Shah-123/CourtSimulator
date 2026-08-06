import { useParams, Link } from "wouter";
import {
  getGetSessionQueryKey,
  getGetSessionVerdictQueryKey,
  SessionStatus,
  useGetSession,
  useGetSessionVerdict,
} from "@workspace/api-client-react";
import { ChevronLeft } from "lucide-react";
import { ApiErrorState } from "@/components/api-state";

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
      <div className="mx-auto max-w-3xl animate-pulse space-y-6 py-8">
        <div className="h-4 w-32 rounded-sm bg-secondary" />
        <div className="h-10 w-72 rounded-sm bg-secondary" />
        <div className="h-56 rounded-sm bg-secondary" />
        <div className="h-40 rounded-sm bg-secondary" />
      </div>
    );
  }

  if (!session || !verdict) {
    return (
      <div className="mx-auto max-w-lg py-24 text-center">
        <h2 className="font-serif text-2xl">No judgment on this file</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The Bench delivers a verdict once the session is closed. This one is
          still open.
        </p>
        <Link
          href={`/sessions/${sessionId}`}
          className="apparatus mt-6 inline-block text-primary underline underline-offset-4"
        >
          Return to the courtroom
        </Link>
      </div>
    );
  }

  const criteria = [
    { label: "Legal reasoning", score: verdict.legalReasoningScore },
    { label: "Persuasiveness", score: verdict.persuasivenessScore },
    { label: "Procedural command", score: verdict.procedureScore },
    { label: "Factual command", score: verdict.factualCommandScore },
  ];

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <Link
        href="/history"
        className="apparatus inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Cause list
      </Link>

      {/* The judgment's own heading, set as a court document sets it. */}
      <header className="mt-6 border-y-2 border-foreground/80 py-6 text-center">
        <p className="apparatus text-muted-foreground">Judgment</p>
        <h1 className="mt-3 font-serif text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
          {session.case.title}
        </h1>
        <p className="apparatus mt-3 text-muted-foreground">
          {session.case.areaOfLaw}
          <span className="mx-2 text-rule">/</span>
          Counsel for the{" "}
          <span className="text-foreground">{session.studentSide}</span>
        </p>
      </header>

      {/* The finding, given the weight it carries. */}
      <section className="flex flex-col items-center border-b border-rule py-10">
        <p className="apparatus text-muted-foreground">Marks awarded</p>
        <p className="mt-2 font-serif text-7xl font-medium leading-none tabular-nums text-primary">
          {verdict.overallScore}
        </p>
        <p className="apparatus mt-3 text-muted-foreground">out of 100</p>
      </section>

      <section className="border-b border-rule py-8">
        <h2 className="apparatus text-muted-foreground">Remarks from the Bench</h2>
        <blockquote className="mt-4 border-l-2 border-primary pl-5 font-serif text-lg leading-relaxed text-foreground/90">
          {verdict.judgeRemarks}
        </blockquote>
      </section>

      <section className="grid grid-cols-1 gap-x-10 gap-y-8 border-b border-rule py-8 sm:grid-cols-2">
        <div>
          <h2 className="apparatus text-seal">What you did well</h2>
          <p className="mt-3 font-serif leading-relaxed text-foreground/85">
            {verdict.strengths}
          </p>
        </div>
        <div>
          <h2 className="apparatus text-stamp">What to work on</h2>
          <p className="mt-3 font-serif leading-relaxed text-foreground/85">
            {verdict.areasForImprovement}
          </p>
        </div>
      </section>

      <section className="py-8">
        <h2 className="apparatus text-muted-foreground">Marks by criterion</h2>
        <dl className="mt-5 divide-y divide-rule/70">
          {criteria.map(({ label, score }) => (
            <div key={label} className="grid grid-cols-[1fr_auto] gap-x-6 py-3.5">
              <dt className="self-center text-sm font-medium">{label}</dt>
              <dd className="apparatus self-center tabular-nums text-foreground">
                {score}
                <span className="text-muted-foreground">/100</span>
              </dd>
              <div className="col-span-2 mt-2.5 h-px w-full bg-rule">
                <div
                  className="h-px bg-primary"
                  style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
                />
              </div>
            </div>
          ))}
        </dl>
      </section>

      <p className="apparatus border-t border-rule pt-5 leading-relaxed text-muted-foreground">
        Marks are awarded by a language model against the record above, not by a
        judge or an examiner. Treat them as practice feedback.
      </p>
    </div>
  );
}
