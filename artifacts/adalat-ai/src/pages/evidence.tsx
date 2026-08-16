import {
  CORPUS,
  CORPUS_CHECKED_ON,
  FINDINGS,
  MEASURED_ON,
  SECTIONS,
  type Freshness,
  type Section,
} from "@/data/evidence";
import {
  FileCheck2,
  Scale,
  ShieldCheck,
  Terminal,
  ExternalLink,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function EvidencePage() {
  return (
    <div className="mx-auto max-w-5xl pb-20 space-y-10">
      {/* Header Banner */}
      <header className="court-card p-6 sm:p-8 bg-card border border-rule shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule/60 pb-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-seal/20 bg-seal/5 px-2.5 py-1 text-xs font-mono uppercase text-seal">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Empirical Legal Verification & Benchmarks</span>
          </div>
          <span className="apparatus text-muted-foreground text-xs">
            Measured: {MEASURED_ON}
          </span>
        </div>

        <div className="space-y-2 max-w-3xl">
          <h1 className="text-balance font-serif text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
            Corpus Integrity & Agent Grounding
          </h1>
          <p className="font-serif text-sm sm:text-base leading-relaxed text-muted-foreground">
            Every metric below is generated from deterministic golden test sets and reproducible evaluation harnesses.
            All legal propositions are strictly audited against official statutes from <strong className="text-foreground font-semibold">pakistancode.gov.pk</strong>.
          </p>
        </div>
      </header>

      {/* Statute Corpus Health Overview */}
      <section className="court-card p-6 bg-gradient-to-br from-card via-card to-seal-wash/20 border border-seal/30 shadow-xs space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule/60 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-sm bg-seal/10 text-seal">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-serif text-xl font-bold text-foreground">
                Pakistan Statutory Law Corpus
              </h2>
              <p className="apparatus text-[0.625rem] text-muted-foreground">
                Ground-truth database for Bench deliberation & objections
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <FreshnessMark
              freshness={CORPUS.freshness}
              checkedOn={CORPUS_CHECKED_ON}
              measuredTitle={`Counted against per-provision flags in the statute files as they stand, ${CORPUS_CHECKED_ON}.`}
            />
            <span className="inline-flex items-center gap-1 font-mono text-xs bg-secondary/60 px-2 py-1 rounded-sm text-muted-foreground border border-rule/50">
              <Terminal className="h-3 w-3" />
              {CORPUS.command}
            </span>
          </div>
        </div>

        <div>
          <p className="font-serif text-2xl font-bold tabular-nums text-foreground">
            <span className="text-seal">{CORPUS.confirmed}</span>
            <span className="text-muted-foreground font-normal text-lg"> of {CORPUS.total}</span>{" "}
            statutory provisions verified word-for-word
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {CORPUS.statutes.map((statute) => (
            <div
              key={statute.code}
              className="p-3.5 rounded-sm bg-secondary/30 border border-rule/60 space-y-1"
            >
              <dt className="apparatus text-muted-foreground text-[0.6875rem] font-bold">
                {statute.code}
              </dt>
              <dd className="font-serif text-xl font-bold tabular-nums text-foreground">
                {statute.confirmed}
                <span className="text-xs text-muted-foreground font-normal">/{statute.total}</span>
              </dd>
            </div>
          ))}
        </dl>

        <p className="text-xs leading-relaxed text-muted-foreground bg-card p-3 rounded-sm border border-rule/50 font-serif">
          {CORPUS.note}
        </p>
      </section>

      {/* Evaluation Sections */}
      <div className="space-y-8">
        <h2 className="apparatus text-foreground font-bold text-sm flex items-center gap-2 border-b border-rule pb-2">
          <Scale className="h-4 w-4 text-primary" />
          Harness Verification Results
        </h2>
        <div className="grid grid-cols-1 gap-6">
          {SECTIONS.map((section) => (
            <EvidenceSection key={section.id} section={section} />
          ))}
        </div>
      </div>

      {/* What Measurements Changed */}
      <section className="court-card p-6 sm:p-8 bg-card border border-rule space-y-6">
        <div>
          <h2 className="font-serif text-2xl font-bold text-foreground">
            What the Empirical Measurements Changed
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Architectural decisions and safeguards that were implemented as a direct result of automated evaluation harness findings:
          </p>
        </div>

        <ol className="space-y-4 divide-y divide-rule/60">
          {FINDINGS.map((finding, index) => (
            <li
              key={finding.title}
              className="pt-4 first:pt-0 grid gap-x-4 gap-y-1 sm:grid-cols-[2.5rem_1fr]"
            >
              <span className="apparatus tabular-nums text-primary font-bold text-sm">
                0{index + 1}
              </span>
              <div className="space-y-1">
                <h3 className="font-serif text-base font-bold text-foreground">
                  {finding.title}
                </h3>
                <p className="font-serif text-xs sm:text-sm leading-relaxed text-muted-foreground">
                  {finding.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function FreshnessMark({
  freshness,
  checkedOn,
  measuredTitle,
}: {
  freshness: Freshness;
  checkedOn?: string;
  measuredTitle?: string;
}) {
  const isMeasured = freshness === "measured";
  return (
    <span
      className={cn(
        "judicial-stamp text-[0.625rem] px-2 py-0.5",
        isMeasured ? "judicial-stamp-sustained" : "judicial-stamp-overruled",
      )}
      title={
        isMeasured
          ? (measuredTitle ?? "Re-run against current code.")
          : "Recorded metric."
      }
    >
      {isMeasured ? "✓ Re-run Golden Harness" : "⚠ Baseline"}
      {isMeasured && checkedOn ? ` (${checkedOn})` : ""}
    </span>
  );
}

function EvidenceSection({ section }: { section: Section }) {
  return (
    <section className="court-card p-5 sm:p-6 bg-card border border-rule space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule/60 pb-3">
        <h3 className="font-serif text-xl font-bold text-foreground">{section.title}</h3>
        <div className="flex items-center gap-2">
          <FreshnessMark freshness={section.freshness} />
          <code className="apparatus text-[0.625rem] text-muted-foreground bg-secondary/50 px-2 py-1 rounded-sm border border-rule/50">
            {section.command}
          </code>
        </div>
      </div>

      <p className="font-serif italic text-xs sm:text-sm text-foreground/80">
        "{section.question}"
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {section.metrics.map((metric) => (
          <div key={metric.label} className="bg-secondary/20 p-3.5 rounded-sm border border-rule/50 space-y-1">
            <p className="apparatus text-muted-foreground text-[0.625rem] font-bold">{metric.label}</p>
            <p className="font-serif text-2xl font-bold tabular-nums text-primary">
              {metric.value}
            </p>
            {metric.note && (
              <p className="text-[0.6875rem] leading-snug text-muted-foreground">
                {metric.note}
              </p>
            )}
          </div>
        ))}
      </div>

      {section.caveat && (
        <div className="p-3 rounded-sm bg-stamp-wash/40 border border-stamp/30 text-xs text-foreground/80 font-serif leading-relaxed">
          <strong className="apparatus text-stamp mr-1 font-bold">Caveat:</strong>
          {section.caveat}
        </div>
      )}
    </section>
  );
}
