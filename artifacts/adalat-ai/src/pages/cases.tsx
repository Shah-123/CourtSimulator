import { useState } from "react";
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
import { Loader2, Plus } from "lucide-react";
import { ApiErrorState, getErrorMessage } from "@/components/api-state";
import { CaseBriefSheet } from "@/components/case-brief";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const DRAFTABLE_AREAS = Object.values(DraftableAreaOfLaw);

const DIFFICULTY_STEPS: Record<string, number> = {
  [Difficulty.Beginner]: 1,
  [Difficulty.Intermediate]: 2,
  [Difficulty.Advanced]: 3,
};

/** Three ticks read as a scale at a glance where a coloured pill does not. */
function DifficultyMark({ difficulty }: { difficulty: string }) {
  const steps = DIFFICULTY_STEPS[difficulty] ?? 1;

  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className="flex items-end gap-[3px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "w-[3px] rounded-full",
              i < steps ? "bg-primary" : "bg-rule",
            )}
            style={{ height: `${6 + i * 3}px` }}
          />
        ))}
      </span>
      <span className="apparatus text-muted-foreground">{difficulty}</span>
    </span>
  );
}

/**
 * A case name, set the way a law report sets it.
 *
 * The "v." between two parties is the most recognisable typographic form in
 * law, and rendering it as ordinary text throws that away. Roman for the
 * parties, small italic for the versus — a lawyer reads the shape before the
 * words. Titles that carry no "v." (a writ petition, a reference) are left
 * exactly as they are rather than forced into a form they do not have.
 */
function CaseName({ title }: { title: string }) {
  const parts = title.split(/\s+v\.?\s+/);
  if (parts.length !== 2) return <>{title}</>;

  return (
    <>
      {parts[0]}{" "}
      <span className="font-normal italic text-muted-foreground">v.</span>{" "}
      {parts[1]}
    </>
  );
}

// A cause list counts its matters in words. Digits are for citations and
// paragraph numbers, which is a distinction the apparatus already makes
// elsewhere in the record.
const COUNTS = [
  "No", "One", "Two", "Three", "Four", "Five",
  "Six", "Seven", "Eight", "Nine", "Ten",
];

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
  const listed = count <= 10 ? COUNTS[count] : String(count);

  return (
    <header className="border-b-[3px] border-double border-rule pb-7">
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
      <h1 className="mt-4 max-w-3xl text-balance font-serif text-[2.5rem] font-normal leading-[0.98] tracking-[-0.022em] sm:text-5xl lg:text-[3.25rem]">
        Matters listed before the bench
      </h1>

      <p className="mt-5 max-w-xl font-serif text-[1.0625rem] leading-relaxed text-foreground/80">
        {listed} {count === 1 ? "matter is" : "matters are"} on the file. Choose
        one and a side; you will argue it aloud against opposing counsel who
        objects, before a bench that rules and marks you on the record.
      </p>
    </header>
  );
}

export default function CasesPage() {
  const { data: cases, isLoading, isError, error, refetch } = useListCases();

  return (
    <div className="space-y-8">
      <CauseListMasthead
        count={Array.isArray(cases) ? cases.length : 0}
      />

      {isError ? (
        <ApiErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="grid animate-pulse grid-cols-1 border-l border-t border-rule md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-56 border-b border-r border-rule bg-card" />
          ))}
        </div>
      ) : !Array.isArray(cases) || cases.length === 0 ? (
        /* The button lives in the masthead, so the empty state points at it
           rather than repeating it — an empty screen should say what to do
           next, not offer the same control twice. */
        <div className="border-b border-rule py-24 text-center">
          <p className="font-serif text-2xl font-normal">The list is empty.</p>
          <p className="mx-auto mt-3 max-w-sm font-serif leading-relaxed text-muted-foreground">
            Draft a case and it is entered on the file, ready to be called.
          </p>
        </div>
      ) : (
        /* Rules are drawn on the cells, not as a coloured gap behind them. The
           gap technique paints the container, so a row that does not divide
           evenly by the column count left a grey panel sitting where a fourth
           matter would be — an empty cell reading as a broken one. */
        <div className="grid grid-cols-1 border-l border-t border-rule md:grid-cols-2 xl:grid-cols-3">
          {cases.map((c) => (
            <article
              key={c.id}
              className="group flex flex-col border-b border-r border-rule bg-card p-5 transition-colors duration-200 hover:bg-accent/25"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="apparatus text-muted-foreground">
                  {c.areaOfLaw}
                </span>
                <DifficultyMark difficulty={c.difficulty} />
              </div>

              <h2 className="mt-3 font-serif text-xl font-medium leading-snug tracking-[-0.012em]">
                <CaseName title={c.title} />
              </h2>
              {/* Clamped: three full citations in monospace outweigh the case
                  name they belong to. The brief carries them in full. */}
              <p
                className="mt-1.5 line-clamp-2 font-mono text-xs leading-snug text-muted-foreground"
                title={c.applicableLaws}
              >
                {c.applicableLaws}
              </p>

              <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                {c.summary}
              </p>

              <dl className="mt-4 space-y-1 border-t border-rule/70 pt-3">
                <div className="flex gap-2 text-sm">
                  <dt className="apparatus w-24 shrink-0 pt-0.5 text-muted-foreground">
                    Petitioner
                  </dt>
                  <dd className="min-w-0 flex-1 truncate">{c.petitionerRole}</dd>
                </div>
                <div className="flex gap-2 text-sm">
                  <dt className="apparatus w-24 shrink-0 pt-0.5 text-muted-foreground">
                    Respondent
                  </dt>
                  <dd className="min-w-0 flex-1 truncate">{c.respondentRole}</dd>
                </div>
                <div className="flex gap-2 text-sm">
                  <dt className="apparatus w-24 shrink-0 pt-0.5 text-muted-foreground">
                    Witnesses
                  </dt>
                  <dd className="flex-1 tabular-nums">{c.witnesses.length}</dd>
                </div>
              </dl>

              <div className="mt-4">
                <ReviewCaseDialog courtCase={c} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
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
        <Button className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Draft a case
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Draft a case</DialogTitle>
          <DialogDescription>
            A scenario is written against Pakistani law, with parties, facts and
            witness statements you can examine.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
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
                <SelectTrigger id="area">
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
              Difficulty
            </label>
            <Select
              value={difficulty}
              onValueChange={(v) => setDifficulty(v as Difficulty)}
            >
              <SelectTrigger id="difficulty">
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

        <DialogFooter>
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
            title: "Case drafted",
            description: `"${newCase.title}" is in your library.`,
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
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Drafting
        </>
      ) : (
        "Draft the case"
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
        <Button variant="outline" className="w-full">
          Read the brief
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader className="border-b border-rule pb-4 text-left">
          <div className="flex items-center justify-between gap-3">
            <span className="apparatus text-muted-foreground">
              {courtCase.areaOfLaw}
            </span>
            <DifficultyMark difficulty={courtCase.difficulty} />
          </div>
          <DialogTitle className="pt-2 font-serif text-2xl font-medium leading-snug">
            {courtCase.title}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {courtCase.applicableLaws}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <section>
            <h3 className="apparatus text-muted-foreground">Facts</h3>
            <p className="mt-2 font-serif leading-relaxed text-foreground/85">
              {courtCase.summary}
            </p>
          </section>

          <section className="grid grid-cols-1 gap-px border border-rule bg-rule sm:grid-cols-2">
            <div className="bg-card p-4">
              <p className="apparatus text-muted-foreground">Petitioner</p>
              <p className="mt-1.5 font-serif text-lg">
                {courtCase.petitionerName}
              </p>
              <p className="text-sm text-muted-foreground">
                {courtCase.petitionerRole}
              </p>
            </div>
            <div className="bg-card p-4">
              <p className="apparatus text-muted-foreground">Respondent</p>
              <p className="mt-1.5 font-serif text-lg">
                {courtCase.respondentName}
              </p>
              <p className="text-sm text-muted-foreground">
                {courtCase.respondentRole}
              </p>
            </div>
          </section>

          {courtCase.brief && <CaseBriefSheet brief={courtCase.brief} />}

          {Array.isArray(courtCase.witnesses) &&
            courtCase.witnesses.length > 0 && (
              <section>
                <h3 className="apparatus border-b border-rule pb-2 text-muted-foreground">
                  Statements on file ({courtCase.witnesses.length})
                </h3>
                <ul className="divide-y divide-rule/70">
                  {courtCase.witnesses.map(
                    (
                      w: { name: string; role: string; statement: string },
                      idx: number,
                    ) => (
                      <li key={idx} className="py-3.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-medium">{w.name}</span>
                          <span className="apparatus shrink-0 text-muted-foreground">
                            {w.role}
                          </span>
                        </div>
                        <p className="mt-1.5 font-serif text-sm italic leading-relaxed text-foreground/80">
                          {w.statement}
                        </p>
                      </li>
                    ),
                  )}
                </ul>
              </section>
            )}

          <section className="border-t border-rule pt-5">
            <h3 className="apparatus text-muted-foreground">
              Which side do you take?
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
                    For the petitioner
                  </SelectItem>
                  <SelectItem value={StudentSide.respondent}>
                    For the respondent
                  </SelectItem>
                </SelectContent>
              </Select>

              <Button
                onClick={handleStart}
                disabled={createSession.isPending}
                className="sm:w-1/2"
              >
                {createSession.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Enter the courtroom
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
