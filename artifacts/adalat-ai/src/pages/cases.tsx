import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  DraftableAreaOfLaw,
  Difficulty,
  StudentSide,
  getListCasesQueryKey,
  useCreateSession,
  useGenerateCase,
  useListCases,
  type Case,
} from "@workspace/api-client-react";
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
import { Loader2 } from "lucide-react";
import { ApiErrorState, getErrorMessage } from "@/components/api-state";
import { CaseBriefSheet } from "@/components/case-brief";
import { CaseName } from "@/components/case-name";
import { useToast } from "@/hooks/use-toast";
import { counted } from "@/lib/format";
import { cn } from "@/lib/utils";

const DRAFTABLE_AREAS = Object.values(DraftableAreaOfLaw);

/**
 * How hard the bench will be, said rather than drawn.
 *
 * This was three coloured bars rising like a signal-strength meter, in seal,
 * primary and stamp — three reserved colours spent on decoration, on a page
 * where stamp means an unverified provision. The word is both more precise and
 * cheaper.
 */
function DifficultyMark({ difficulty }: { difficulty: string }) {
  return (
    <span className="apparatus shrink-0 text-muted-foreground">
      {difficulty}
    </span>
  );
}

/**
 * The masthead of the day's cause list.
 *
 * A cause list is the sheet posted outside a Pakistani courtroom naming the
 * matters to be called that day, and it is precisely what this page is — so it
 * is set as one rather than as a dashboard header. The date is the sitting, the
 * count is the list, and the double rule beneath is the one the printed sheet
 * carries between its heading and its first entry.
 */
function CauseListMasthead({ count }: { count: number }) {
  const sitting = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <header className="masthead-rule pb-7">
      {/* The action sits on the heading line, not beside the standfirst. Left
          to align with the paragraph it ended up floating in dead space beside
          a three-line block, which read as a stray control rather than the
          list's one affordance. */}
      <div className="flex items-start justify-between gap-4">
        <p className="apparatus flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-muted-foreground">
          <span>Cause list</span>
          {/* Dropped on narrow screens, where the line breaks after it and
              leaves the separator dangling at the end of the first row. */}
          <span aria-hidden="true" className="hidden sm:inline">
            ·
          </span>
          <span>{sitting}</span>
        </p>
        <GenerateCaseDialog />
      </div>

      {/* Set lighter and larger than a UI heading would be: Newsreader's
          optical sizing does the work at display size, and weight added on top
          of it reads as shouting rather than as a masthead. */}
      <h1 className="display mt-4 max-w-3xl">
        Matters listed before the bench
      </h1>

      <p className="standfirst mt-5">
        {counted(count)} {count === 1 ? "matter is" : "matters are"} on the file.
        Choose one and a side; you will argue it aloud against opposing counsel
        who objects, before a bench that rules and marks you on the record.
      </p>
    </header>
  );
}

export default function CasesPage() {
  const { data: cases, isLoading, isError, error, refetch } = useListCases();
  const [selectedArea, setSelectedArea] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCases = useMemo(() => {
    if (!Array.isArray(cases)) return [];
    return cases.filter((c) => {
      const matchesArea =
        selectedArea === "ALL" ||
        c.areaOfLaw.toLowerCase() === selectedArea.toLowerCase();
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.title.toLowerCase().includes(q) ||
        c.applicableLaws.toLowerCase().includes(q) ||
        c.summary.toLowerCase().includes(q);
      return matchesArea && matchesSearch;
    });
  }, [cases, selectedArea, searchQuery]);

  // Derived from the matters actually on the file, not from the enum. The
  // enum lists areas the corpus cannot ground — offering a filter for one
  // would promise a body of law this system does not hold, which is the thing
  // "Offer only the areas of law the corpus can ground" set out to stop. A
  // pill only appears once a matter exists behind it.
  const areas = useMemo(() => {
    if (!Array.isArray(cases)) return ["ALL"];
    return ["ALL", ...[...new Set(cases.map((c) => c.areaOfLaw))].sort()];
  }, [cases]);

  return (
    <div className="space-y-9 pb-16">
      <CauseListMasthead count={Array.isArray(cases) ? cases.length : 0} />

      {/* The list's controls sit under its masthead, not inside it: a cause
          list is read before it is filtered, and a search box competing with
          the heading would invert that. Hidden until there is enough on the
          file to be worth narrowing. */}
      {Array.isArray(cases) && cases.length > 3 && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by matter, provision or facts…"
            aria-label="Search the cause list"
            className="max-w-md rounded-sm"
          />

          {/* Only worth showing when there is more than one area to choose
              between; today the file is criminal-only and a lone pill beside
              "ALL" is a control with nothing to do. */}
          {areas.length > 2 && (
            <ToggleGroup
              type="single"
              value={selectedArea}
              onValueChange={(v) => v && setSelectedArea(v)}
              className="justify-start gap-5 self-start"
            >
              {areas.map((area) => (
                <ToggleGroupItem
                  key={area}
                  value={area}
                  className={cn(
                    "apparatus h-auto rounded-none border-b-2 border-transparent px-0 pb-1 pt-1 text-muted-foreground",
                    "hover:bg-transparent hover:text-foreground",
                    "data-[state=on]:border-foreground data-[state=on]:bg-transparent data-[state=on]:text-foreground",
                  )}
                >
                  {area === "ALL" ? "All" : area}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
        </div>
      )}

      {isError ? (
        <ApiErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="divide-y divide-rule/70 border-y border-rule">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-3 py-7">
              <Skeleton className="h-3 w-32 rounded-sm" />
              <Skeleton className="h-6 w-2/3 rounded-sm" />
              <Skeleton className="h-4 w-full max-w-2xl rounded-sm" />
              <Skeleton className="h-4 w-1/2 rounded-sm" />
            </div>
          ))}
        </div>
      ) : !Array.isArray(cases) || cases.length === 0 ? (
        /* Nothing on the file at all, which is a different thing from a filter
           matching nothing and reads differently. The button lives in the
           masthead, so this points at it rather than repeating it — an empty
           screen should say what to do next, not offer the same control twice. */
        <div className="border-b border-rule py-24 text-center">
          <p className="display-sm">The list is empty.</p>
          <p className="mx-auto mt-3 max-w-sm font-serif leading-relaxed text-muted-foreground">
            Draft a case and it is entered on the file, ready to be called.
          </p>
        </div>
      ) : filteredCases.length === 0 ? (
        /* Matters exist, the filter hid them. Offering to clear the filter is
           the useful action here; offering to draft another case is not. */
        <Empty className="border border-dashed border-rule">
          <EmptyHeader>
            <EmptyTitle className="font-serif text-xl font-normal">
              No matter on the file answers to that.
            </EmptyTitle>
            <EmptyDescription>
              Every case is still listed — the search or the area filter is what
              is hiding them.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setSelectedArea("ALL");
              }}
            >
              Clear the filter
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        /* Set as a list rather than as a grid of tiles. The masthead calls
           this a cause list and a cause list is a numbered column of matters;
           three tiles abreast was the dashboard idiom the rest of the app has
           now left behind. */
        <ol className="divide-y divide-rule/70 border-y border-rule">
          {filteredCases.map((c, index) => (
            <CaseEntry key={c.id} index={index + 1} courtCase={c} />
          ))}
        </ol>
      )}
    </div>
  );
}

function CaseEntry({ index, courtCase }: { index: number; courtCase: Case }) {
  return (
    <li className="grid gap-x-6 gap-y-3 py-7 sm:grid-cols-[3rem_1fr]">
      <span className="apparatus hidden pt-1.5 tabular-nums text-muted-foreground sm:block">
        {String(index).padStart(2, "0")}
      </span>

      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-4">
          <p className="apparatus text-muted-foreground">
            {courtCase.areaOfLaw}
          </p>
          <DifficultyMark difficulty={courtCase.difficulty} />
        </div>

        <h2 className="mt-2 font-serif text-2xl font-normal leading-snug tracking-[-0.015em] text-foreground">
          <CaseName title={courtCase.title} />
        </h2>

        {/* The parties as a law report arrays them, on one line. They were in
            a bordered inner box with "PETITIONER:" and "RESPONDENT:" labels —
            a form, inside a list, inside a page. */}
        <p className="mt-2 font-serif leading-relaxed text-muted-foreground">
          {courtCase.petitionerName}{" "}
          <span className="italic">({courtCase.petitionerRole})</span>{" "}
          <span className="italic">v.</span> {courtCase.respondentName}{" "}
          <span className="italic">({courtCase.respondentRole})</span>
        </p>

        <p
          className="mt-2 truncate font-mono text-xs text-foreground/70"
          title={courtCase.applicableLaws}
        >
          {courtCase.applicableLaws}
        </p>

        <p className="mt-3 max-w-2xl font-serif leading-relaxed text-foreground/85">
          {courtCase.summary}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <ReviewCaseDialog courtCase={courtCase} />
          <span className="apparatus text-muted-foreground">
            {counted(courtCase.witnesses?.length ?? 0).toLowerCase()}{" "}
            {courtCase.witnesses?.length === 1 ? "witness" : "witnesses"} on
            record
          </span>
        </div>
      </div>
    </li>
  );
}

function GenerateCaseDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [area, setArea] = useState<DraftableAreaOfLaw>(
    DraftableAreaOfLaw.Criminal,
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.Beginner);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="shrink-0">Draft a matter</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="display-sm text-left">
            Draft a matter
          </DialogTitle>
          <DialogDescription className="text-left font-serif">
            A moot case is written from the statutory corpus — facts, parties,
            witness statements and grounds of appeal, every citation checked
            against the corpus before it is entered on the file.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-3">
          <div className="space-y-2">
            <label htmlFor="area" className="apparatus text-muted-foreground">
              Area of law
            </label>
            {/* One draftable area today, so the control reads as a statement
                rather than a choice — a select holding a single option asks a
                question with one answer. Driven off the enum, so restoring a
                second area brings the dropdown back with it. */}
            {DRAFTABLE_AREAS.length > 1 ? (
              <Select
                value={area}
                onValueChange={(v) => setArea(v as DraftableAreaOfLaw)}
              >
                <SelectTrigger id="area" className="w-full">
                  <SelectValue placeholder="Choose an area" />
                </SelectTrigger>
                <SelectContent>
                  {DRAFTABLE_AREAS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p id="area" className="font-serif text-lg">
                {area}
              </p>
            )}
            {/* Said out loud rather than left for a student to discover. */}
            <p className="apparatus text-muted-foreground">
              The proceeding the corpus and the objection grounds both support.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="difficulty"
              className="apparatus text-muted-foreground"
            >
              How hard the bench should be
            </label>
            <Select
              value={difficulty}
              onValueChange={(v) => setDifficulty(v as Difficulty)}
            >
              <SelectTrigger id="difficulty" className="w-full">
                <SelectValue placeholder="Choose a difficulty" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(Difficulty).map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <GenerateCaseButton
            area={area}
            difficulty={difficulty}
            onSuccess={() => setIsOpen(false)}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GenerateCaseButton({
  area,
  difficulty,
  onSuccess,
}: {
  area: DraftableAreaOfLaw;
  difficulty: Difficulty;
  onSuccess: () => void;
}) {
  const generateCase = useGenerateCase();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleGenerate = () => {
    generateCase.mutate(
      { data: { areaOfLaw: area, difficulty } },
      {
        onSuccess: (newCase) => {
          queryClient.invalidateQueries({ queryKey: getListCasesQueryKey() });
          queryClient.refetchQueries({ queryKey: getListCasesQueryKey() });
          toast({
            title: "Entered on the file",
            description: `“${newCase.title}” is now listed.`,
          });
          onSuccess();
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "The case could not be drafted",
            description: getErrorMessage(error),
          });
        },
      },
    );
  };

  return (
    <Button onClick={handleGenerate} disabled={generateCase.isPending}>
      {generateCase.isPending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Drafting…</span>
        </>
      ) : (
        <span>Draft it</span>
      )}
    </Button>
  );
}

function ReviewCaseDialog({ courtCase }: { courtCase: Case }) {
  const [isOpen, setIsOpen] = useState(false);
  const [side, setSide] = useState<StudentSide>(StudentSide.petitioner);
  const createSession = useCreateSession();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleStart = () => {
    createSession.mutate(
      { data: { caseId: courtCase.id, studentSide: side } },
      {
        onSuccess: (session) => {
          setLocation(`/sessions/${session.id}`);
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "The courtroom could not be opened",
            description: getErrorMessage(error),
          });
        },
      },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Read the brief and appear
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader className="border-b border-rule pb-4 text-left">
          <div className="flex items-baseline justify-between gap-3">
            <span className="apparatus text-muted-foreground">
              {courtCase.areaOfLaw}
            </span>
            <DifficultyMark difficulty={courtCase.difficulty} />
          </div>
          <DialogTitle className="display-sm pt-2 text-left">
            <CaseName title={courtCase.title} />
          </DialogTitle>
          <DialogDescription className="font-mono text-xs text-foreground/75">
            {courtCase.applicableLaws}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-7 py-2">
          <section>
            <h3 className="rule-heading">
              <span>The facts</span>
            </h3>
            <p className="mt-3 font-serif leading-relaxed text-foreground/90">
              {courtCase.summary}
            </p>
          </section>

          <section className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <div>
              <p className="apparatus text-muted-foreground">
                Petitioner / prosecution
              </p>
              <p className="mt-1 font-serif text-lg leading-snug text-foreground">
                {courtCase.petitionerName}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {courtCase.petitionerRole}
              </p>
            </div>
            <div>
              <p className="apparatus text-muted-foreground">
                Respondent / defence
              </p>
              <p className="mt-1 font-serif text-lg leading-snug text-foreground">
                {courtCase.respondentName}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {courtCase.respondentRole}
              </p>
            </div>
          </section>

          {courtCase.brief && <CaseBriefSheet brief={courtCase.brief} />}

          {Array.isArray(courtCase.witnesses) &&
            courtCase.witnesses.length > 0 && (
              <section>
                <h3 className="rule-heading">
                  <span>Witness statements on file</span>
                  <span className="tabular-nums">
                    {courtCase.witnesses.length}
                  </span>
                </h3>
                <ul className="max-h-56 divide-y divide-rule/70 overflow-y-auto pr-1">
                  {courtCase.witnesses.map(
                    (
                      w: { name: string; role: string; statement: string },
                      idx: number,
                    ) => (
                      <li key={idx} className="py-3 first:pt-2">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-serif text-foreground">
                            {w.name}
                          </span>
                          <span className="apparatus shrink-0 text-muted-foreground">
                            {w.role}
                          </span>
                        </div>
                        <p className="mt-1 font-serif text-sm italic leading-relaxed text-foreground/75">
                          “{w.statement}”
                        </p>
                      </li>
                    ),
                  )}
                </ul>
              </section>
            )}

          <section className="border-t border-rule pt-6">
            <h3 className="apparatus text-muted-foreground">
              Which side do you appear for?
            </h3>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <Select
                value={side}
                onValueChange={(v) => setSide(v as StudentSide)}
              >
                <SelectTrigger className="sm:w-1/2">
                  <SelectValue placeholder="Choose a side" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={StudentSide.petitioner}>
                    Petitioner / State
                  </SelectItem>
                  <SelectItem value={StudentSide.respondent}>
                    Respondent / accused
                  </SelectItem>
                </SelectContent>
              </Select>

              <Button
                onClick={handleStart}
                disabled={createSession.isPending}
                className="sm:w-1/2"
              >
                {createSession.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                <span>Enter the courtroom</span>
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
