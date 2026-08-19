import { useGetDashboardSummary } from "@workspace/api-client-react";
import { Link } from "wouter";
import { ApiErrorState } from "@/components/api-state";
import { CaseName } from "@/components/case-name";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { counted } from "@/lib/format";

function humanise(skill: string): string {
  const spaced = skill.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * One figure from the record, set as a figure.
 *
 * These were four tinted tiles each with an icon in a coloured square, which
 * spent seal, gold, stamp and primary on decoration — four reserved colours
 * used to mean "this is a statistic" on a page where they otherwise mean
 * verified, unverified and the bench. The number carries it on its own at this
 * size, so the colour goes back to being available for what it is for.
 */
function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="px-0 py-5 sm:px-6 sm:first:pl-0 sm:last:pr-0">
      <p className="apparatus text-muted-foreground">{label}</p>
      <p className="mt-2 font-serif text-[2.5rem] leading-none tabular-nums text-foreground">
        {value}
      </p>
      {note && (
        <p className="apparatus mt-2 text-muted-foreground">{note}</p>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const {
    data: summary,
    isLoading,
    isError,
    error,
    refetch,
  } = useGetDashboardSummary();

  if (isError) {
    return <ApiErrorState error={error} onRetry={() => void refetch()} />;
  }

  if (isLoading) {
    return (
      <div className="space-y-9 pb-16">
        <div className="masthead-rule space-y-4 pb-7">
          <Skeleton className="h-3 w-24 rounded-sm" />
          <Skeleton className="h-12 w-2/3 rounded-sm" />
          <Skeleton className="h-5 w-1/2 rounded-sm" />
        </div>
        <div className="grid grid-cols-1 divide-y divide-rule border-b border-rule sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3 py-5 sm:px-6">
              <Skeleton className="h-3 w-20 rounded-sm" />
              <Skeleton className="h-10 w-16 rounded-sm" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-sm" />
          <Skeleton className="h-64 rounded-sm" />
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const average = summary.averageOverallScore;

  return (
    <div className="space-y-9 pb-16">
      <header className="masthead-rule pb-7">
        <div className="flex items-start justify-between gap-4">
          <p className="apparatus pt-1 text-muted-foreground">Chambers</p>
          <Link href="/">
            <Button className="shrink-0">Select a matter</Button>
          </Link>
        </div>

        <h1 className="display mt-4 max-w-3xl">Your standing at the bar</h1>

        <p className="standfirst mt-5">
          What the bench has made of your advocacy so far — the marks it gave,
          the areas you have argued in, and the two skills its remarks keep
          returning to.
        </p>
      </header>

      {/* The figures, divided by a rule rather than boxed into tiles. */}
      <section className="grid grid-cols-1 divide-y divide-rule border-b border-rule sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Figure
          label="Appearances"
          value={String(summary.totalSessions)}
          note={`${counted(summary.completedSessions).toLowerCase()} carried to judgment`}
        />
        <Figure
          label="Average mark"
          value={average ? average.toFixed(1) : "—"}
          note={
            average
              ? average >= 75
                ? "Distinction standing"
                : average >= 50
                  ? "Qualified standing"
                  : "Below the pass mark"
              : "No judgment delivered yet"
          }
        />
        <Figure
          label="Matters on file"
          value={String(summary.sessionsByAreaOfLaw.length)}
          note={
            summary.sessionsByAreaOfLaw.length === 1
              ? "one area of law"
              : "areas of law argued"
          }
        />
      </section>

      {/* The bench's reading of the advocate rather than of the record. Set as
          prose, because "Legal reasoning" and "Procedure" are judgements and a
          numeral would imply a precision the scorer does not claim. */}
      {(summary.strongestSkill || summary.weakestSkill) && (
        <section className="grid grid-cols-1 gap-x-10 gap-y-5 border-b border-rule pb-7 sm:grid-cols-2">
          <div>
            <p className="apparatus text-muted-foreground">Strongest</p>
            <p className="mt-1.5 font-serif text-xl leading-snug text-seal">
              {summary.strongestSkill
                ? humanise(summary.strongestSkill)
                : "Not yet apparent"}
            </p>
          </div>
          <div>
            <p className="apparatus text-muted-foreground">
              Where the bench presses hardest
            </p>
            <p className="mt-1.5 font-serif text-xl leading-snug text-stamp">
              {summary.weakestSkill
                ? humanise(summary.weakestSkill)
                : "Not yet apparent"}
            </p>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-12">
        <section>
          <h2 className="rule-heading">
            <span>Practice by area of law</span>
            <span className="tabular-nums">
              {summary.sessionsByAreaOfLaw.length}
            </span>
          </h2>

          {summary.sessionsByAreaOfLaw.length > 0 ? (
            <dl className="divide-y divide-rule/70">
              {summary.sessionsByAreaOfLaw.map((item) => {
                const percentage = Math.round(
                  (item.count / Math.max(1, summary.totalSessions)) * 100,
                );
                return (
                  <div key={item.areaOfLaw} className="space-y-2 py-4">
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="font-serif text-[1.0625rem] text-foreground">
                        {item.areaOfLaw}
                      </dt>
                      <dd className="apparatus shrink-0 tabular-nums text-muted-foreground">
                        {counted(item.count).toLowerCase()}{" "}
                        {item.count === 1 ? "hearing" : "hearings"} · {percentage}%
                      </dd>
                    </div>
                    <Progress
                      value={percentage}
                      aria-label={`${item.areaOfLaw}: ${percentage}% of your hearings`}
                      className="h-[3px] rounded-none bg-rule"
                      indicatorClassName="rounded-none bg-foreground/70"
                    />
                  </div>
                );
              })}
            </dl>
          ) : (
            <p className="py-10 font-serif leading-relaxed text-muted-foreground">
              Nothing argued yet.{" "}
              <Link
                href="/"
                className="text-foreground underline underline-offset-4"
              >
                Select a matter
              </Link>{" "}
              and this fills in as you appear.
            </p>
          )}
        </section>

        <section>
          <h2 className="rule-heading">
            <span>Recent hearings</span>
            <Link
              href="/history"
              className="text-foreground underline underline-offset-4 hover:opacity-80"
            >
              All appearances
            </Link>
          </h2>

          {summary.recentSessions.length > 0 ? (
            <ul className="divide-y divide-rule/70">
              {summary.recentSessions.map((session) => {
                const isClosed = session.status === "completed";
                return (
                  <li key={session.id}>
                    <Link
                      href={
                        isClosed
                          ? `/sessions/${session.id}/verdict`
                          : `/sessions/${session.id}`
                      }
                      className="group flex items-baseline justify-between gap-4 py-4 transition-colors hover:bg-secondary/30"
                    >
                      <div className="min-w-0">
                        <span className="block truncate font-serif text-[1.0625rem] leading-snug text-foreground underline-offset-4 group-hover:underline">
                          <CaseName title={session.caseTitle} />
                        </span>
                        <p className="apparatus mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                          <span>{session.areaOfLaw}</span>
                          <span aria-hidden="true">·</span>
                          <span>for the {session.studentSide}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {new Date(session.createdAt).toLocaleDateString(
                              "en-GB",
                              { day: "numeric", month: "short", year: "numeric" },
                            )}
                          </span>
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        {isClosed ? (
                          <span className="font-serif text-xl leading-none tabular-nums text-foreground">
                            {session.overallScore}
                            <span className="text-sm text-muted-foreground">
                              /100
                            </span>
                          </span>
                        ) : (
                          <span className="apparatus text-muted-foreground">
                            Part-heard
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-10 font-serif leading-relaxed text-muted-foreground">
              No hearing has been called yet.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
