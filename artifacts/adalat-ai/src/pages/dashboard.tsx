import { useGetDashboardSummary } from "@workspace/api-client-react";
import { ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { ApiErrorState } from "@/components/api-state";

function humanise(skill: string): string {
  return skill.replace(/([A-Z])/g, " $1").trim();
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
      <div className="animate-pulse space-y-8">
        <div className="h-10 w-56 rounded-sm bg-secondary" />
        <div className="grid grid-cols-2 gap-px bg-rule lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-background" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="h-64 rounded-sm bg-secondary" />
          <div className="h-64 rounded-sm bg-secondary" />
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const stats = [
    {
      label: "Sessions",
      value: String(summary.totalSessions),
      note: `${summary.completedSessions} closed`,
    },
    {
      label: "Average marks",
      value: summary.averageOverallScore
        ? summary.averageOverallScore.toFixed(1)
        : "—",
      note: "out of 100",
      accent: true,
    },
    {
      label: "Strongest",
      value: summary.strongestSkill ? humanise(summary.strongestSkill) : "—",
      note: summary.strongestSkill ? "" : "Not enough sessions yet",
      small: true,
    },
    {
      label: "Weakest",
      value: summary.weakestSkill ? humanise(summary.weakestSkill) : "—",
      note: summary.weakestSkill ? "" : "Not enough sessions yet",
      small: true,
    },
  ];

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">
          Chambers
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          How your practice is going.
        </p>
      </div>

      {/* Hairline-separated figures rather than four floating cards. */}
      <div className="grid grid-cols-2 gap-px border border-rule bg-rule lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-card px-5 py-5">
            <p className="apparatus text-muted-foreground">{stat.label}</p>
            <p
              className={[
                "mt-2 font-serif leading-tight",
                stat.small ? "text-xl" : "text-4xl tabular-nums",
                stat.accent ? "text-primary" : "text-foreground",
              ].join(" ")}
            >
              {stat.value}
            </p>
            {stat.note ? (
              <p className="apparatus mt-1.5 text-muted-foreground">
                {stat.note}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <section>
          <h2 className="apparatus border-b border-rule pb-2.5 text-muted-foreground">
            Practice by area of law
          </h2>
          {summary.sessionsByAreaOfLaw.length > 0 ? (
            <dl className="divide-y divide-rule/70">
              {summary.sessionsByAreaOfLaw.map((item) => (
                <div
                  key={item.areaOfLaw}
                  className="grid grid-cols-[1fr_auto] gap-x-6 py-3.5"
                >
                  <dt className="self-center text-sm font-medium">
                    {item.areaOfLaw}
                  </dt>
                  <dd className="apparatus self-center tabular-nums text-muted-foreground">
                    {item.count}
                  </dd>
                  <div className="col-span-2 mt-2.5 h-px w-full bg-rule">
                    <div
                      className="h-px bg-primary"
                      style={{
                        width: `${(item.count / Math.max(1, summary.totalSessions)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </dl>
          ) : (
            <p className="py-8 text-sm text-muted-foreground">
              Nothing recorded yet.{" "}
              <Link
                href="/"
                className="text-primary underline underline-offset-4"
              >
                Pick a case
              </Link>{" "}
              to start.
            </p>
          )}
        </section>

        <section>
          <div className="flex items-baseline justify-between border-b border-rule pb-2.5">
            <h2 className="apparatus text-muted-foreground">Recent sessions</h2>
            <Link
              href="/history"
              className="apparatus flex items-center text-primary hover:underline"
            >
              All <ChevronRight className="ml-0.5 h-3 w-3" />
            </Link>
          </div>

          {summary.recentSessions.length > 0 ? (
            <ul className="divide-y divide-rule/70">
              {summary.recentSessions.map((session) => (
                <li key={session.id}>
                  <Link
                    href={
                      session.status === "completed"
                        ? `/sessions/${session.id}/verdict`
                        : `/sessions/${session.id}`
                    }
                    className="block py-3.5 transition-colors hover:bg-secondary/50"
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="truncate font-serif text-[1.0625rem]">
                        {session.caseTitle}
                      </span>
                      {session.status === "completed" ? (
                        <span className="apparatus shrink-0 tabular-nums text-primary">
                          {session.overallScore}
                        </span>
                      ) : (
                        <span className="apparatus shrink-0 text-stamp">
                          open
                        </span>
                      )}
                    </div>
                    <p className="apparatus mt-1 text-muted-foreground">
                      {session.areaOfLaw}
                      <span className="mx-2 text-rule">/</span>
                      {session.studentSide}
                      <span className="mx-2 text-rule">/</span>
                      {new Date(session.createdAt).toLocaleDateString()}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-sm text-muted-foreground">
              No sessions yet.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
