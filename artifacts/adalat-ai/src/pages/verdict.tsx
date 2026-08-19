import { useParams, Link } from "wouter";
import {
  getGetSessionQueryKey,
  getGetSessionVerdictQueryKey,
  SessionStatus,
  useGetSession,
  useGetSessionVerdict,
} from "@workspace/api-client-react";
import { ApiErrorState } from "@/components/api-state";
import { CaseName } from "@/components/case-name";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { docket } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The judgment, set as a judgment.
 *
 * This is the one page in the app that is a document rather than a screen, so
 * it is the one page that gets a centred heading, a wide margin and a single
 * column. It previously sat inside a bordered card with a shadow, on a page
 * that also had a card — a judgment reproduced on a business-card back. The
 * sheet is now the page.
 */
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
        title="The judgment could not be loaded"
      />
    );
  }

  if (isSessionLoading || isVerdictLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-8 py-10">
        <Skeleton className="mx-auto h-3 w-56 rounded-sm" />
        <Skeleton className="mx-auto h-12 w-2/3 rounded-sm" />
        <Skeleton className="mx-auto h-24 w-40 rounded-sm" />
        <Skeleton className="h-32 rounded-sm" />
        <Skeleton className="h-48 rounded-sm" />
      </div>
    );
  }

  if (!session || !verdict) {
    return (
      <div className="mx-auto max-w-lg py-24 text-center">
        <p className="apparatus text-muted-foreground">No judgment on file</p>
        <h1 className="display-sm mt-3">This matter is still part-heard.</h1>
        <p className="mx-auto mt-3 max-w-sm font-serif leading-relaxed text-muted-foreground">
          The bench delivers its judgment once the hearing concludes. Return to
          the courtroom and close your case.
        </p>
        <Link
          href={`/sessions/${sessionId}`}
          className="apparatus mt-6 inline-block text-foreground underline underline-offset-4"
        >
          Back to the courtroom
        </Link>
      </div>
    );
  }

  const criteria = [
    { label: "Legal reasoning and statutory application", score: verdict.legalReasoningScore },
    { label: "Persuasiveness and oral delivery", score: verdict.persuasivenessScore },
    { label: "Procedural command and objections", score: verdict.procedureScore },
    { label: "Command of the facts and the sworn record", score: verdict.factualCommandScore },
  ];

  const isDistinction = verdict.overallScore >= 75;
  const isPass = verdict.overallScore >= 50;

  return (
    <article className="mx-auto max-w-2xl pb-20">
      <nav className="flex items-center justify-between gap-4 pb-8">
        <Link
          href="/history"
          className="apparatus text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          ← Appearances
        </Link>
        <Link href="/">
          <Button variant="outline" size="sm">
            Select the next matter
          </Button>
        </Link>
      </nav>

      <header className="masthead-rule pb-8 text-center">
        <p className="apparatus text-muted-foreground">
          In the High Court · moot sitting
        </p>
        <h1 className="display mt-4">Judgment and evaluation</h1>
        <p className="apparatus mt-4 tabular-nums text-muted-foreground">
          {docket(session.id)} · {session.case.areaOfLaw}
        </p>
        <p className="mx-auto mt-5 max-w-lg font-serif text-[1.0625rem] leading-relaxed text-foreground/85">
          In the matter of <CaseName title={session.case.title} />, in which you
          appeared as counsel for the{" "}
          <span className="text-foreground">{session.studentSide}</span>.
        </p>
      </header>

      {/* The mark. One numeral, set at display size, because it is the single
          thing a student opens this page to read. */}
      <section className="border-b border-rule py-10 text-center">
        <p className="apparatus text-muted-foreground">Overall</p>
        <p className="mt-3 flex items-baseline justify-center gap-1">
          <span
            className={cn(
              "font-serif text-8xl leading-none tabular-nums tracking-[-0.03em]",
              isDistinction
                ? "text-seal"
                : isPass
                  ? "text-foreground"
                  : "text-stamp",
            )}
          >
            {verdict.overallScore}
          </span>
          <span className="font-serif text-3xl text-muted-foreground">
            /100
          </span>
        </p>
        <p className="apparatus mt-4 text-muted-foreground">
          {isDistinction
            ? "First class — distinction"
            : isPass
              ? "Qualified appearance"
              : "Further preparation required"}
        </p>
      </section>

      <section className="border-b border-rule py-10">
        <h2 className="apparatus text-center text-muted-foreground">
          Remarks from the bench
        </h2>
        {/* Set as the judgment's own prose rather than as a callout box: this
            is the bench speaking, and it is the longest thing on the page. */}
        <blockquote className="mx-auto mt-5 max-w-xl text-balance font-serif text-xl leading-relaxed text-foreground">
          “{verdict.judgeRemarks}”
        </blockquote>
      </section>

      {/* Marked with a rule in the reserved colour rather than filled with it.
          A wash behind a paragraph of ordinary feedback spends seal and stamp
          on something that is not a verification state. */}
      <section className="grid grid-cols-1 gap-8 border-b border-rule py-10 sm:grid-cols-2">
        <div className="border-l-2 border-seal pl-4">
          <h3 className="apparatus text-seal">What was done well</h3>
          <p className="mt-2 font-serif leading-relaxed text-foreground/90">
            {verdict.strengths}
          </p>
        </div>
        <div className="border-l-2 border-stamp pl-4">
          <h3 className="apparatus text-stamp">What to correct</h3>
          <p className="mt-2 font-serif leading-relaxed text-foreground/90">
            {verdict.areasForImprovement}
          </p>
        </div>
      </section>

      <section className="py-10">
        <h2 className="rule-heading">
          <span>Evaluation by criterion</span>
        </h2>
        <dl className="divide-y divide-rule/70">
          {criteria.map(({ label, score }) => (
            <div key={label} className="space-y-2 py-4">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="font-serif text-[1.0625rem] leading-snug text-foreground">
                  {label}
                </dt>
                <dd className="shrink-0 font-serif text-lg tabular-nums text-foreground">
                  {score}
                  <span className="text-sm text-muted-foreground">/100</span>
                </dd>
              </div>
              <Progress
                value={Math.max(0, Math.min(100, score))}
                aria-label={`${label}: ${score} out of 100`}
                className="h-[3px] rounded-none bg-rule"
                indicatorClassName={cn(
                  "rounded-none",
                  score >= 75
                    ? "bg-seal"
                    : score >= 50
                      ? "bg-foreground/70"
                      : "bg-stamp",
                )}
              />
            </div>
          ))}
        </dl>
      </section>

      <footer className="border-t border-rule pt-5 text-center">
        <p className="apparatus leading-relaxed text-muted-foreground">
          Marked by the deliberation graph against the record of proceedings and
          the statutory corpus
        </p>
      </footer>
    </article>
  );
}
