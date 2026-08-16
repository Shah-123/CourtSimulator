import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  AreaOfLaw,
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

export default function CasesPage() {
  const { data: cases, isLoading, isError, error, refetch } = useListCases();

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">
            Case library
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Choose a matter and a side. You will argue it aloud against opposing
            counsel, before a bench that objects, rules, and marks you on the
            record.
          </p>
        </div>
        <GenerateCaseDialog />
      </div>

      {isError ? (
        <ApiErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="grid animate-pulse grid-cols-1 gap-px border border-rule bg-rule md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-56 bg-background" />
          ))}
        </div>
      ) : !Array.isArray(cases) || cases.length === 0 ? (
        <div className="border-y border-rule py-20 text-center">
          <p className="font-serif text-xl">No cases on file.</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Draft one and it is added to the library for you to argue.
          </p>
          <div className="mt-6 flex justify-center">
            <GenerateCaseDialog />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-px border border-rule bg-rule md:grid-cols-2 xl:grid-cols-3">
          {cases.map((c) => (
            <article key={c.id} className="flex flex-col bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="apparatus text-muted-foreground">
                  {c.areaOfLaw}
                </span>
                <DifficultyMark difficulty={c.difficulty} />
              </div>

              <h2 className="mt-3 font-serif text-xl font-medium leading-snug">
                {c.title}
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
  const [area, setArea] = useState<AreaOfLaw>(AreaOfLaw.Criminal);
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
            <Select value={area} onValueChange={(v) => setArea(v as AreaOfLaw)}>
              <SelectTrigger id="area">
                <SelectValue placeholder="Choose an area" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(AreaOfLaw).map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
  area: AreaOfLaw;
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
