import { useState, useMemo } from "react";
import { useListSessions, SessionStatus } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { ApiErrorState } from "@/components/api-state";
import { CaseName } from "@/components/case-name";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { counted, docket, phaseLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

type Filter = "ALL" | "ACTIVE" | "COMPLETED";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Part-heard" },
  { value: "COMPLETED", label: "Decided" },
];

/**
 * The record of what has already been heard.
 *
 * Set as the register a court keeps rather than as a dashboard table: a rule
 * between entries, the docket number in the margin, the mark on the right. It
 * carried a card wrapper, a shadow and a tinted header strip, none of which a
 * register has — and the wrapper was what made this page read as a different
 * product from the case library it lists the results of.
 */
export default function HistoryPage() {
  const {
    data: sessions,
    isLoading,
    isError,
    error,
    refetch,
  } = useListSessions();

  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");

  const all = Array.isArray(sessions) ? sessions : [];

  const filtered = useMemo(() => {
    return all.filter((s) => {
      const isClosed = s.status === SessionStatus.completed;
      const matchesStatus =
        filter === "ALL" ||
        (filter === "COMPLETED" && isClosed) ||
        (filter === "ACTIVE" && !isClosed);
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        s.caseTitle.toLowerCase().includes(q) ||
        s.areaOfLaw.toLowerCase().includes(q) ||
        s.studentSide.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [all, filter, searchQuery]);

  const decided = all.filter(
    (s) => s.status === SessionStatus.completed,
  ).length;

  return (
    <div className="space-y-9 pb-16">
      <header className="masthead-rule pb-7">
        <div className="flex items-start justify-between gap-4">
          <p className="apparatus pt-1 text-muted-foreground">
            Record of proceedings
          </p>
          <Link href="/">
            <Button className="shrink-0">Select a matter</Button>
          </Link>
        </div>

        <h1 className="display mt-4 max-w-3xl">Your appearances</h1>

        <p className="standfirst mt-5">
          {counted(all.length)} {all.length === 1 ? "hearing is" : "hearings are"}{" "}
          on your record{decided > 0 ? `, ${counted(decided).toLowerCase()} of them decided` : ""}.
          A part-heard matter resumes where the bench rose; a decided one opens
          at its judgment.
        </p>
      </header>

      {/* Hidden until the register is long enough to be worth narrowing —
          three entries do not need a search box above them. */}
      {all.length > 3 && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by matter, area or side…"
            aria-label="Search your appearances"
            className="max-w-sm rounded-sm"
          />

          <ToggleGroup
            type="single"
            value={filter}
            // Radix clears a single-select group when the active item is
            // pressed again. An empty filter is not a state this list has, so
            // the press is ignored rather than dropping every entry.
            onValueChange={(v) => v && setFilter(v as Filter)}
            className="justify-start gap-5 self-start"
          >
            {FILTERS.map((f) => (
              <ToggleGroupItem
                key={f.value}
                value={f.value}
                aria-label={`Show ${f.label.toLowerCase()} matters`}
                className={cn(
                  "apparatus h-auto rounded-none border-b-2 border-transparent px-0 pb-1 pt-1 text-muted-foreground",
                  "hover:bg-transparent hover:text-foreground",
                  "data-[state=on]:border-foreground data-[state=on]:bg-transparent data-[state=on]:text-foreground",
                )}
              >
                {f.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}

      {isError ? (
        <ApiErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="divide-y divide-rule/70 border-y border-rule">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 py-5">
              <Skeleton className="hidden h-3 w-16 rounded-sm md:block" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3 rounded-sm" />
                <Skeleton className="h-3 w-1/3 rounded-sm" />
              </div>
              <Skeleton className="h-6 w-14 rounded-sm" />
            </div>
          ))}
        </div>
      ) : all.length === 0 ? (
        /* Nothing has ever been heard, which is a different thing from a
           filter matching nothing and reads differently. */
        <div className="border-b border-rule py-24 text-center">
          <p className="display-sm">Nothing has been heard yet.</p>
          <p className="mx-auto mt-3 max-w-sm font-serif leading-relaxed text-muted-foreground">
            Appear in a matter and it is entered here — part-heard while you are
            arguing it, decided once the bench has marked you.
          </p>
          <Link
            href="/"
            className="apparatus mt-6 inline-block text-foreground underline underline-offset-4"
          >
            Open the case library
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <Empty className="border border-dashed border-rule">
          <EmptyHeader>
            <EmptyTitle className="font-serif text-xl font-normal">
              No appearance answers to that.
            </EmptyTitle>
            <EmptyDescription>
              Every hearing is still on the record — the search or the filter is
              what is hiding them.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setFilter("ALL");
              }}
            >
              Clear the filter
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <section>
          {/* Column heads, in the margin above the rule — the shape a printed
              register uses. Dropped below md, where four columns cannot sit on
              a phone without truncating the only one that matters. */}
          <div className="hidden grid-cols-[6rem_1fr_7rem_6rem] gap-x-6 border-b border-rule pb-2 md:grid">
            <span className="apparatus text-muted-foreground">Docket</span>
            <span className="apparatus text-muted-foreground">Matter</span>
            <span className="apparatus text-muted-foreground">Heard</span>
            <span className="apparatus text-right text-muted-foreground">
              Mark
            </span>
          </div>

          <ul className="divide-y divide-rule/70 border-b border-rule">
            {filtered.map((session) => {
              const isClosed = session.status === SessionStatus.completed;

              return (
                <li key={session.id}>
                  <Link
                    href={
                      isClosed
                        ? `/sessions/${session.id}/verdict`
                        : `/sessions/${session.id}`
                    }
                    className="group grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1.5 py-4 transition-colors hover:bg-secondary/30 md:grid-cols-[6rem_1fr_7rem_6rem]"
                  >
                    <span className="apparatus hidden tabular-nums text-muted-foreground md:block">
                      {docket(session.id)}
                    </span>

                    <div className="min-w-0">
                      <span className="block truncate font-serif text-[1.0625rem] leading-snug text-foreground underline-offset-4 group-hover:underline">
                        <CaseName title={session.caseTitle} />
                      </span>
                      <p className="apparatus mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                        <span>{session.areaOfLaw}</span>
                        <span aria-hidden="true">·</span>
                        <span>for the {session.studentSide}</span>
                        {!isClosed && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-stamp">
                              {phaseLabel(session.phase)}
                            </span>
                          </>
                        )}
                      </p>
                    </div>

                    <span className="apparatus hidden tabular-nums text-muted-foreground md:block">
                      {format(new Date(session.createdAt), "d MMM yyyy")}
                    </span>

                    {/* The mark, or the fact that there is not one yet. A
                        part-heard matter is not a failure and is not stamped
                        like one — it is stated in the same apparatus as the
                        date beside it. */}
                    <div className="text-right">
                      {isClosed && session.overallScore !== null ? (
                        <span className="font-serif text-2xl leading-none tabular-nums text-foreground">
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
        </section>
      )}
    </div>
  );
}
