import { useGetDashboardSummary } from "@workspace/api-client-react";
import {
  ChevronRight,
  Scale,
  Award,
  TrendingUp,
  AlertTriangle,
  BookOpen,
  ArrowUpRight,
  Gavel,
  History,
  CheckCircle2,
} from "lucide-react";
import { Link } from "wouter";
import { ApiErrorState } from "@/components/api-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
      <div className="animate-pulse space-y-8 pb-12">
        <div className="h-10 w-56 rounded-sm bg-secondary" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-sm bg-card border border-rule" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="h-64 rounded-sm bg-card border border-rule" />
          <div className="h-64 rounded-sm bg-card border border-rule" />
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const stats = [
    {
      label: "Total Appearances",
      value: String(summary.totalSessions),
      note: `${summary.completedSessions} with formal decree`,
      icon: Scale,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Average Judicial Score",
      value: summary.averageOverallScore
        ? `${summary.averageOverallScore.toFixed(1)}/100`
        : "—",
      note: summary.averageOverallScore && summary.averageOverallScore >= 75
        ? "Distinction standing"
        : "Bench evaluations",
      icon: Award,
      color: "text-seal",
      bg: "bg-seal/10",
      accent: true,
    },
    {
      label: "Strongest Skill Area",
      value: summary.strongestSkill ? humanise(summary.strongestSkill) : "—",
      note: summary.strongestSkill ? "High judicial marks" : "Awaiting data",
      icon: TrendingUp,
      color: "text-gold",
      bg: "bg-gold/10",
      small: true,
    },
    {
      label: "Area for Growth",
      value: summary.weakestSkill ? humanise(summary.weakestSkill) : "—",
      note: summary.weakestSkill ? "Focus area for next trial" : "Awaiting data",
      icon: AlertTriangle,
      color: "text-stamp",
      bg: "bg-stamp/10",
      small: true,
    },
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* Chambers Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-rule pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            <h1 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
              Chambers & Performance
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Judicial evaluations, advocacy analytics, and statutory command across all courtroom appearances.
          </p>
        </div>
        <Link href="/">
          <Button className="gap-1.5 shadow-sm">
            <BookOpen className="h-4 w-4" />
            <span>Enter New Trial</span>
          </Button>
        </Link>
      </div>

      {/* 4 Scorecard Widgets */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="court-card p-5 flex flex-col justify-between relative overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <p className="apparatus text-muted-foreground text-[0.6875rem]">
                  {stat.label}
                </p>
                <div className={cn("p-2 rounded-sm", stat.bg, stat.color)}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>

              <div className="mt-4">
                <p
                  className={cn(
                    "font-serif font-bold leading-tight",
                    stat.small ? "text-lg truncate" : "text-3xl tabular-nums",
                    stat.accent ? "text-primary" : "text-foreground",
                  )}
                >
                  {stat.value}
                </p>
                {stat.note && (
                  <p className="apparatus mt-1.5 text-muted-foreground text-[0.625rem]">
                    {stat.note}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Analytics Breakdown & Recent Sessions */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Practice by Area of Law */}
        <section className="court-card p-6 flex flex-col">
          <div className="flex items-center justify-between border-b border-rule pb-3">
            <h2 className="apparatus font-bold text-foreground flex items-center gap-2">
              <Gavel className="h-4 w-4 text-primary" />
              Practice by Area of Law
            </h2>
            <span className="apparatus text-muted-foreground text-xs">
              {summary.sessionsByAreaOfLaw.length} Areas
            </span>
          </div>

          {summary.sessionsByAreaOfLaw.length > 0 ? (
            <dl className="mt-4 divide-y divide-rule/60 flex-1">
              {summary.sessionsByAreaOfLaw.map((item) => {
                const percentage = Math.round(
                  (item.count / Math.max(1, summary.totalSessions)) * 100,
                );
                return (
                  <div key={item.areaOfLaw} className="py-3.5 space-y-1.5">
                    <div className="flex justify-between items-center text-sm">
                      <dt className="font-semibold text-foreground">
                        {item.areaOfLaw}
                      </dt>
                      <dd className="apparatus tabular-nums text-muted-foreground font-semibold">
                        {item.count} {item.count === 1 ? "trial" : "trials"} ({percentage}%)
                      </dd>
                    </div>
                    <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </dl>
          ) : (
            <div className="py-12 text-center text-muted-foreground my-auto">
              <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm">No courtroom appearances on file yet.</p>
              <Link
                href="/"
                className="apparatus mt-2 inline-block text-primary hover:underline"
              >
                Select a matter to begin
              </Link>
            </div>
          )}
        </section>

        {/* Recent Hearings & Decrees */}
        <section className="court-card p-6 flex flex-col">
          <div className="flex items-center justify-between border-b border-rule pb-3">
            <h2 className="apparatus font-bold text-foreground flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              Recent Courtroom Hearings
            </h2>
            <Link
              href="/history"
              className="apparatus flex items-center gap-1 text-primary hover:underline text-xs"
            >
              Full Cause List <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          {summary.recentSessions.length > 0 ? (
            <ul className="mt-4 divide-y divide-rule/60 flex-1">
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
                      className="group flex items-center justify-between py-3.5 px-2 rounded-sm transition-colors hover:bg-secondary/40"
                    >
                      <div className="min-w-0 pr-4">
                        <span className="block truncate font-serif font-semibold text-foreground group-hover:text-primary transition-colors text-sm">
                          {session.caseTitle}
                        </span>
                        <p className="apparatus mt-0.5 text-muted-foreground text-[0.625rem] flex items-center gap-1.5">
                          <span>{session.areaOfLaw}</span>
                          <span className="text-rule">·</span>
                          <span>for the {session.studentSide}</span>
                          <span className="text-rule">·</span>
                          <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isClosed ? (
                          <span className="inline-flex items-center gap-1 rounded-sm bg-seal/10 px-2 py-0.5 font-mono text-xs font-bold text-seal border border-seal/20">
                            <CheckCircle2 className="h-3 w-3" />
                            {session.overallScore}/100
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-sm bg-stamp/10 px-2 py-0.5 font-mono text-[0.6875rem] font-bold text-stamp border border-stamp/20">
                            Part-Heard
                          </span>
                        )}
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="py-12 text-center text-muted-foreground my-auto">
              <History className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm">No recent appearances found.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
