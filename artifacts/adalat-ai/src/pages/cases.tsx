import { useState, useMemo } from "react";
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
import {
  Loader2,
  Plus,
  Search,
  BookOpen,
  Gavel,
  Users,
  Scale,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { ApiErrorState, getErrorMessage } from "@/components/api-state";
import { CaseBriefSheet } from "@/components/case-brief";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const DIFFICULTY_STEPS: Record<string, number> = {
  [Difficulty.Beginner]: 1,
  [Difficulty.Intermediate]: 2,
  [Difficulty.Advanced]: 3,
};

function DifficultyMark({ difficulty }: { difficulty: string }) {
  const steps = DIFFICULTY_STEPS[difficulty] ?? 1;
  const labels = ["Junior", "High Court", "Supreme Court"];
  const colorMap = [
    "text-seal bg-seal/10 border-seal/20",
    "text-primary bg-primary/10 border-primary/20",
    "text-stamp bg-stamp/10 border-stamp/20",
  ];

  return (
    <div className="flex items-center gap-1.5">
      <span aria-hidden="true" className="flex items-end gap-[3px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "w-[3px] rounded-full transition-all",
              i < steps
                ? i === 2
                  ? "bg-stamp"
                  : i === 1
                  ? "bg-primary"
                  : "bg-seal"
                : "bg-rule",
            )}
            style={{ height: `${6 + i * 3}px` }}
          />
        ))}
      </span>
      <span
        className={cn(
          "apparatus px-1.5 py-0.5 rounded-sm border text-[0.625rem]",
          colorMap[steps - 1] ?? "text-muted-foreground border-rule",
        )}
      >
        {difficulty}
      </span>
    </div>
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

  const areas = ["ALL", ...Object.values(AreaOfLaw)];

  return (
    <div className="space-y-8 pb-12">
      {/* Hero Section with Judicial Elevation */}
      <div className="relative overflow-hidden rounded-sm border border-rule bg-gradient-to-br from-card via-card to-secondary/30 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-2.5">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-mono uppercase text-primary">
              <Scale className="h-3.5 w-3.5" />
              <span>Sovereign Advocacy Simulator</span>
            </div>
            <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Case Library & Cause List
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              Select a matter, review the case brief and evidence on file, and take the rostrum.
              You will argue aloud before an active Pakistani Bench that evaluates your statutory citations, handles objections, and delivers a recorded verdict.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <GenerateCaseDialog />
          </div>
        </div>

        {/* Quick Search & Filter Controls */}
        <div className="mt-8 flex flex-col gap-4 border-t border-rule/70 pt-6 sm:flex-row sm:items-center sm:justify-between">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by case title, statute (e.g. § 302 PPC), or facts..."
              className="w-full rounded-sm border border-rule bg-background py-2 pl-9 pr-4 text-xs placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          {/* Area of Law Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {areas.map((area) => {
              const active = selectedArea === area;
              return (
                <button
                  key={area}
                  onClick={() => setSelectedArea(area)}
                  className={cn(
                    "apparatus px-2.5 py-1.5 rounded-sm transition-all text-[0.6875rem]",
                    active
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground border border-rule/50",
                  )}
                >
                  {area}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Case Grid / Error / Loading States */}
      {isError ? (
        <ApiErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-sm border border-rule bg-card/60 p-5 space-y-4"
            >
              <div className="h-4 w-24 bg-secondary" />
              <div className="h-6 w-3/4 bg-secondary" />
              <div className="h-16 w-full bg-secondary/50" />
            </div>
          ))}
        </div>
      ) : filteredCases.length === 0 ? (
        <div className="rounded-sm border border-dashed border-rule bg-card/40 py-16 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 font-serif text-xl font-medium">No matters found matching your search</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Try adjusting your search query or area of law filter, or draft a new case.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            {searchQuery && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedArea("ALL");
                }}
              >
                Reset filters
              </Button>
            )}
            <GenerateCaseDialog />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredCases.map((c) => (
            <CaseCard key={c.id} courtCase={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CaseCard({ courtCase }: { courtCase: Case }) {
  return (
    <article className="court-card flex flex-col justify-between p-5 group relative overflow-hidden">
      <div className="space-y-3">
        {/* Top Apparatus Row */}
        <div className="flex items-center justify-between gap-2 border-b border-rule/60 pb-2.5">
          <span className="apparatus text-primary font-bold">
            {courtCase.areaOfLaw}
          </span>
          <DifficultyMark difficulty={courtCase.difficulty} />
        </div>

        {/* Case Title */}
        <h2 className="font-serif text-lg font-bold leading-snug text-foreground group-hover:text-primary transition-colors">
          {courtCase.title}
        </h2>

        {/* Statutory Grounding Pills */}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-seal" />
          <p
            className="line-clamp-1 font-mono text-[0.6875rem] text-foreground/75"
            title={courtCase.applicableLaws}
          >
            {courtCase.applicableLaws}
          </p>
        </div>

        {/* Case Summary */}
        <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          {courtCase.summary}
        </p>

        {/* Parties List */}
        <div className="rounded-sm bg-secondary/30 p-2.5 text-xs space-y-1.5 border border-rule/40 font-mono">
          <div className="flex justify-between items-center text-[0.6875rem]">
            <span className="text-muted-foreground uppercase">Petitioner:</span>
            <span className="truncate max-w-[180px] font-semibold text-foreground">
              {courtCase.petitionerRole}
            </span>
          </div>
          <div className="flex justify-between items-center text-[0.6875rem]">
            <span className="text-muted-foreground uppercase">Respondent:</span>
            <span className="truncate max-w-[180px] font-semibold text-foreground">
              {courtCase.respondentRole}
            </span>
          </div>
          <div className="flex justify-between items-center text-[0.6875rem] border-t border-rule/50 pt-1">
            <span className="text-muted-foreground uppercase flex items-center gap-1">
              <Users className="h-3 w-3" /> Witnesses:
            </span>
            <span className="text-foreground font-semibold">
              {courtCase.witnesses?.length ?? 0} on record
            </span>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="mt-5 pt-3 border-t border-rule/60">
        <ReviewCaseDialog courtCase={courtCase} />
      </div>
    </article>
  );
}

function GenerateCaseDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [area, setArea] = useState<AreaOfLaw>(AreaOfLaw.Criminal);
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.Beginner);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="shrink-0 gap-1.5 shadow-sm">
          <Sparkles className="h-4 w-4" />
          <span>Draft New Matter (AI)</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Gavel className="h-5 w-5" />
            <DialogTitle className="font-serif text-xl">Draft Legal Matter</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Generate an authentic moot court case grounded in Pakistani statutory law (PPC, CrPC, QSO, Constitution), complete with witnesses and grounds of appeal.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-3">
          <div className="space-y-1.5">
            <label htmlFor="area" className="apparatus text-muted-foreground">
              Area of Law
            </label>
            <Select value={area} onValueChange={(v) => setArea(v as AreaOfLaw)}>
              <SelectTrigger id="area" className="w-full">
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

          <div className="space-y-1.5">
            <label
              htmlFor="difficulty"
              className="apparatus text-muted-foreground"
            >
              Bench Complexity & Difficulty
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
            title: "Case Drafted Successfully",
            description: `"${newCase.title}" is now added to the cause library.`,
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
    <Button onClick={handleGenerate} disabled={generateCase.isPending} className="gap-1.5">
      {generateCase.isPending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Generating scenario...</span>
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4" />
          <span>Generate Case</span>
        </>
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
        <Button variant="outline" size="sm" className="w-full gap-1.5 hover:border-primary/60 hover:text-primary">
          <BookOpen className="h-3.5 w-3.5" />
          <span>Read Brief & Appear</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader className="border-b border-rule pb-4 text-left">
          <div className="flex items-center justify-between gap-3">
            <span className="apparatus text-primary font-bold">
              {courtCase.areaOfLaw}
            </span>
            <DifficultyMark difficulty={courtCase.difficulty} />
          </div>
          <DialogTitle className="pt-2 font-serif text-2xl font-bold leading-snug">
            {courtCase.title}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs text-foreground/80 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-seal" />
            {courtCase.applicableLaws}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <section className="space-y-1.5">
            <h3 className="apparatus text-muted-foreground flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" /> Factual Matrix & Summary
            </h3>
            <p className="font-serif text-sm leading-relaxed text-foreground/90 bg-card p-3 rounded-sm border border-rule">
              {courtCase.summary}
            </p>
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="bg-card p-3.5 rounded-sm border border-rule">
              <p className="apparatus text-muted-foreground">Petitioner / Prosecution</p>
              <p className="mt-1 font-serif font-semibold text-foreground">
                {courtCase.petitionerName}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {courtCase.petitionerRole}
              </p>
            </div>
            <div className="bg-card p-3.5 rounded-sm border border-rule">
              <p className="apparatus text-muted-foreground">Respondent / Defense</p>
              <p className="mt-1 font-serif font-semibold text-foreground">
                {courtCase.respondentName}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {courtCase.respondentRole}
              </p>
            </div>
          </section>

          {courtCase.brief && <CaseBriefSheet brief={courtCase.brief} />}

          {Array.isArray(courtCase.witnesses) &&
            courtCase.witnesses.length > 0 && (
              <section className="space-y-2">
                <h3 className="apparatus border-b border-rule pb-1.5 text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Witness Statements on File ({courtCase.witnesses.length})
                </h3>
                <ul className="divide-y divide-rule/70 max-h-48 overflow-y-auto pr-1">
                  {courtCase.witnesses.map(
                    (
                      w: { name: string; role: string; statement: string },
                      idx: number,
                    ) => (
                      <li key={idx} className="py-2.5 first:pt-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-semibold text-xs text-foreground">{w.name}</span>
                          <span className="apparatus text-[0.625rem] text-muted-foreground">
                            {w.role}
                          </span>
                        </div>
                        <p className="mt-1 font-serif text-xs italic leading-relaxed text-foreground/80 bg-secondary/20 p-2 rounded-sm border border-rule/40">
                          "{w.statement}"
                        </p>
                      </li>
                    ),
                  )}
                </ul>
              </section>
            )}

          <section className="border-t border-rule pt-5 bg-secondary/15 p-4 rounded-sm">
            <h3 className="apparatus text-foreground font-semibold mb-2">
              Select Your Representation & Appear
            </h3>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Select
                value={side}
                onValueChange={(v) => setSide(v as StudentSide)}
              >
                <SelectTrigger className="sm:w-1/2 bg-background">
                  <SelectValue placeholder="Choose a side" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={StudentSide.petitioner}>
                    Appear for Petitioner / State
                  </SelectItem>
                  <SelectItem value={StudentSide.respondent}>
                    Appear for Respondent / Accused
                  </SelectItem>
                </SelectContent>
              </Select>

              <Button
                onClick={handleStart}
                disabled={createSession.isPending}
                className="sm:w-1/2 gap-1.5 shadow-sm"
              >
                {createSession.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                <span>Enter Courtroom</span>
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
