import { useListSessions, SessionStatus } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { ArrowRight } from "lucide-react";
import { ApiErrorState } from "@/components/api-state";

/**
 * A cause list: the sheet a court posts each morning naming every matter
 * before it. Rows, ruled, in the order they were taken up — which is what this
 * data actually is, and reads better than a grid of cards.
 */
export default function HistoryPage() {
  const {
    data: sessions,
    isLoading,
    isError,
    error,
    refetch,
  } = useListSessions();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">
          Cause list
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Every matter you have appeared in.
        </p>
      </div>

      {isError ? (
        <ApiErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="animate-pulse divide-y divide-rule">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-secondary/40" />
          ))}
        </div>
      ) : !Array.isArray(sessions) || sessions.length === 0 ? (
        <div className="border-y border-rule py-20 text-center">
          <p className="font-serif text-xl">The list is empty.</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Nothing has been called yet. Pick a case and the first matter is
            entered here.
          </p>
          <Link
            href="/"
            className="apparatus mt-6 inline-block text-primary underline underline-offset-4"
          >
            Case library
          </Link>
        </div>
      ) : (
        <div className="border-t border-rule">
          {/* Column headings, as a printed list carries them. */}
          <div className="hidden grid-cols-[3rem_1fr_9rem_7rem_3rem] gap-x-5 border-b border-rule py-2.5 md:grid">
            <span className="apparatus text-muted-foreground">No.</span>
            <span className="apparatus text-muted-foreground">Matter</span>
            <span className="apparatus text-muted-foreground">Listed</span>
            <span className="apparatus text-right text-muted-foreground">
              Marks
            </span>
            <span className="sr-only">Open</span>
          </div>

          <ul className="divide-y divide-rule/70">
            {sessions.map((session, index) => {
              const isClosed = session.status === SessionStatus.completed;

              return (
                <li key={session.id}>
                  <Link
                    href={
                      isClosed
                        ? `/sessions/${session.id}/verdict`
                        : `/sessions/${session.id}`
                    }
                    className="group grid grid-cols-[1fr_auto] items-center gap-x-5 gap-y-1.5 py-4 transition-colors hover:bg-secondary/50 md:grid-cols-[3rem_1fr_9rem_7rem_3rem]"
                  >
                    <span className="apparatus hidden tabular-nums text-muted-foreground/70 md:block">
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <span className="min-w-0">
                      <span className="block truncate font-serif text-[1.0625rem] group-hover:text-primary">
                        {session.caseTitle}
                      </span>
                      <span className="apparatus mt-1 block text-muted-foreground">
                        {session.areaOfLaw}
                        <span className="mx-2 text-rule">/</span>
                        for the {session.studentSide}
                        {!isClosed && (
                          <>
                            <span className="mx-2 text-rule">/</span>
                            <span className="text-stamp">
                              part-heard · {session.phase.replace(/_/g, " ")}
                            </span>
                          </>
                        )}
                      </span>
                    </span>

                    <span className="apparatus hidden text-muted-foreground md:block">
                      {format(new Date(session.createdAt), "d MMM yyyy")}
                    </span>

                    <span className="text-right">
                      {isClosed && session.overallScore !== null ? (
                        <span className="font-serif text-2xl tabular-nums leading-none text-primary">
                          {session.overallScore}
                        </span>
                      ) : (
                        <span className="apparatus text-muted-foreground/60">
                          —
                        </span>
                      )}
                    </span>

                    <span className="hidden justify-self-end text-muted-foreground transition-colors group-hover:text-primary md:block">
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
