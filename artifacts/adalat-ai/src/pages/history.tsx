import { useState, useMemo } from "react";
import { useListSessions, SessionStatus } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  ArrowRight,
  ListOrdered,
  Search,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Scale,
} from "lucide-react";
import { ApiErrorState } from "@/components/api-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HistoryPage() {
  const {
    data: sessions,
    isLoading,
    isError,
    error,
    refetch,
  } = useListSessions();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "COMPLETED" | "ACTIVE">("ALL");

  const filteredSessions = useMemo(() => {
    if (!Array.isArray(sessions)) return [];
    return sessions.filter((s) => {
      const isClosed = s.status === SessionStatus.completed;
      const matchesStatus =
        filterStatus === "ALL" ||
        (filterStatus === "COMPLETED" && isClosed) ||
        (filterStatus === "ACTIVE" && !isClosed);
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        s.caseTitle.toLowerCase().includes(q) ||
        s.areaOfLaw.toLowerCase().includes(q) ||
        s.studentSide.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [sessions, filterStatus, searchQuery]);

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-rule pb-5">
        <div>
          <div className="flex items-center gap-2">
            <ListOrdered className="h-5 w-5 text-primary" />
            <h1 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
              Official Cause List & History
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Complete judicial record of all proceedings, listed hearings, and delivered decrees.
          </p>
        </div>

        <Link href="/">
          <Button className="gap-1.5 shadow-sm">
            <BookOpen className="h-4 w-4" />
            <span>Select Next Matter</span>
          </Button>
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search cause list by title or party..."
            className="w-full rounded-sm border border-rule bg-background py-2 pl-9 pr-3 text-xs placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-secondary/40 p-1 rounded-sm border border-rule">
          {(["ALL", "ACTIVE", "COMPLETED"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={cn(
                "apparatus px-3 py-1 text-[0.6875rem] rounded-sm transition-all",
                filterStatus === status
                  ? "bg-card text-foreground font-semibold shadow-xs border border-rule text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {status === "ALL" ? "All Matters" : status === "ACTIVE" ? "Part-Heard" : "Decrees Issued"}
            </button>
          ))}
        </div>
      </div>

      {/* Main List */}
      {isError ? (
        <ApiErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="animate-pulse divide-y divide-rule border border-rule rounded-sm bg-card">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-secondary/30 p-4" />
          ))}
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="rounded-sm border border-dashed border-rule bg-card/50 py-16 text-center">
          <Scale className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="font-serif text-xl font-medium">The Cause List is Clear</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            No hearing entries found matching the active filter.
          </p>
          <Link
            href="/"
            className="apparatus mt-5 inline-flex items-center gap-1 text-primary hover:underline text-xs"
          >
            Open Case Library
          </Link>
        </div>
      ) : (
        <div className="court-card overflow-hidden bg-card border border-rule shadow-xs">
          {/* Table Header */}
          <div className="hidden grid-cols-[3.5rem_1fr_9rem_7rem_3rem] gap-x-4 border-b border-rule bg-secondary/30 px-5 py-3 text-xs apparatus font-bold text-muted-foreground md:grid">
            <span>No.</span>
            <span>Matter & Pleading</span>
            <span>Hearing Date</span>
            <span className="text-right">Marks / Status</span>
            <span className="sr-only">Action</span>
          </div>

          <ul className="divide-y divide-rule/70">
            {filteredSessions.map((session, index) => {
              const isClosed = session.status === SessionStatus.completed;

              return (
                <li key={session.id}>
                  <Link
                    href={
                      isClosed
                        ? `/sessions/${session.id}/verdict`
                        : `/sessions/${session.id}`
                    }
                    className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 p-4 transition-colors hover:bg-secondary/40 md:grid-cols-[3.5rem_1fr_9rem_7rem_3rem]"
                  >
                    {/* Index */}
                    <span className="apparatus hidden tabular-nums text-muted-foreground/70 font-semibold md:block">
                      AD-{session.id.toString().padStart(3, "0")}
                    </span>

                    {/* Title & Meta */}
                    <div className="min-w-0 pr-2">
                      <span className="block truncate font-serif text-base font-bold text-foreground group-hover:text-primary transition-colors">
                        {session.caseTitle}
                      </span>
                      <p className="apparatus mt-1 text-[0.6875rem] text-muted-foreground flex items-center gap-1.5">
                        <span className="text-primary font-semibold">{session.areaOfLaw}</span>
                        <span className="text-rule">/</span>
                        <span>Counsel for {session.studentSide}</span>
                        {!isClosed && (
                          <>
                            <span className="text-rule">/</span>
                            <span className="text-stamp font-bold flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-stamp animate-pulse" />
                              Part-Heard · {session.phase.replace(/_/g, " ")}
                            </span>
                          </>
                        )}
                      </p>
                    </div>

                    {/* Date */}
                    <span className="apparatus hidden text-xs text-muted-foreground md:block">
                      {format(new Date(session.createdAt), "d MMM yyyy")}
                    </span>

                    {/* Score / Status */}
                    <div className="text-right">
                      {isClosed && session.overallScore !== null ? (
                        <div className="flex flex-col items-end">
                          <span className="font-serif text-xl font-bold tabular-nums leading-none text-seal">
                            {session.overallScore}
                            <span className="text-xs text-muted-foreground font-normal">/100</span>
                          </span>
                          <span className="apparatus text-[0.625rem] text-seal font-semibold mt-0.5">
                            Decreed
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center rounded-sm bg-stamp/10 px-2 py-0.5 font-mono text-[0.625rem] font-bold text-stamp border border-stamp/20">
                          Active Hearing
                        </span>
                      )}
                    </div>

                    {/* Arrow */}
                    <span className="hidden justify-self-end text-muted-foreground transition-transform group-hover:text-primary group-hover:translate-x-1 md:block">
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
