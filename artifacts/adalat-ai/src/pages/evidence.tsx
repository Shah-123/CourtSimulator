import {
  CORPUS,
  FINDINGS,
  MEASURED_ON,
  SECTIONS,
  type Freshness,
  type Section,
} from "@/data/evidence";
import { cn } from "@/lib/utils";

/**
 * What the system has been measured to do, and where the measurement stops.
 *
 * The numbers behind this project lived in three markdown files nobody opens.
 * A claim about hybrid retrieval is worth little; "hit@1 moves 0.90 → 1.00 on a
 * fixed 20-query set, and here is the command that shows it" is worth a lot.
 *
 * Two rules hold this page together. Every figure names the command that
 * produced it, so it can be re-run rather than believed. And a figure nobody
 * has re-run since the code changed is labelled as such — the `--stamp` colour
 * is reserved for things that are contested or outstanding, and a stale metric
 * is exactly that.
 */
export default function EvidencePage() {
  return (
    <div className="mx-auto max-w-4xl pb-20">
      <header className="border-b border-rule pb-8">
        <p className="apparatus text-muted-foreground">On the evidence</p>
        <h1 className="mt-2 text-balance font-serif text-3xl font-medium tracking-tight sm:text-4xl">
          What this system has been measured to do
        </h1>
        <p className="mt-4 max-w-2xl font-serif text-[1.0625rem] leading-relaxed text-foreground/80">
          Every figure below came from a fixed golden set and a command printed
          beside it. Nothing here is a live reading — it is a record of runs, so
          that a number can be reproduced rather than taken on trust.
        </p>
        <p className="apparatus mt-4 text-muted-foreground">
          Measured {MEASURED_ON}
        </p>
      </header>

      <div className="divide-y divide-rule/70">
        {SECTIONS.map((section) => (
          <EvidenceSection key={section.id} section={section} />
        ))}
      </div>

      {/* The corpus is the one place the project is knowingly incomplete, so it
          is stated at full size rather than tucked into a caveat. */}
      <section className="mt-12 border border-stamp/30 bg-stamp-wash/40 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-serif text-2xl">The statute corpus</h2>
          <code className="apparatus text-muted-foreground">
            {CORPUS.command}
          </code>
        </div>

        <p className="mt-1.5 font-serif text-[1.0625rem] tabular-nums">
          <span className="text-seal">{CORPUS.confirmed}</span>
          <span className="text-muted-foreground"> of {CORPUS.total}</span>{" "}
          provisions confirmed word-for-word against the official text
        </p>

        <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2.5 sm:grid-cols-4">
          {CORPUS.statutes.map((statute) => (
            <div key={statute.code}>
              <dt className="apparatus text-muted-foreground">
                {statute.code}
              </dt>
              <dd className="mt-0.5 font-serif text-lg tabular-nums">
                {statute.confirmed}
                <span className="text-muted-foreground">/{statute.total}</span>
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-foreground/75">
          {CORPUS.note}
        </p>
      </section>

      <section className="mt-14">
        <h2 className="font-serif text-2xl">What the measurements changed</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          The results worth showing are the ones that overturned a decision. Each
          of these was found by a harness rather than by reading the code.
        </p>

        <ol className="mt-6 space-y-7">
          {FINDINGS.map((finding, index) => (
            <li
              key={finding.title}
              className="grid gap-x-6 gap-y-2 sm:grid-cols-[3rem_1fr]"
            >
              <span className="apparatus tabular-nums text-muted-foreground/70">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-serif text-lg leading-snug">
                  {finding.title}
                </h3>
                <p className="mt-1.5 font-serif leading-relaxed text-foreground/75">
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

function FreshnessMark({ freshness }: { freshness: Freshness }) {
  const isMeasured = freshness === "measured";
  return (
    <span
      className={cn("apparatus", isMeasured ? "text-seal" : "text-stamp")}
      title={
        isMeasured
          ? "Re-run against the code as it currently stands."
          : "Taken from the recorded results and not re-run for this build."
      }
    >
      {isMeasured ? "✓ re-run" : "⚠ not re-run"}
    </span>
  );
}

function EvidenceSection({ section }: { section: Section }) {
  return (
    <section className="py-9">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="font-serif text-2xl">{section.title}</h2>
        <div className="flex items-center gap-3">
          <FreshnessMark freshness={section.freshness} />
          <code className="apparatus text-muted-foreground">
            {section.command}
          </code>
        </div>
      </div>

      <p className="mt-2 max-w-2xl font-serif italic leading-relaxed text-foreground/70">
        {section.question}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-px border border-rule bg-rule lg:grid-cols-4">
        {section.metrics.map((metric) => (
          <div key={metric.label} className="bg-card px-4 py-4">
            <p className="apparatus text-muted-foreground">{metric.label}</p>
            <p className="mt-1.5 font-serif text-2xl tabular-nums leading-none">
              {metric.value}
            </p>
            {metric.note ? (
              <p className="mt-2 text-xs leading-snug text-muted-foreground">
                {metric.note}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {section.caveat ? (
        <p className="mt-4 max-w-2xl border-l-2 border-stamp/40 pl-4 text-sm leading-relaxed text-foreground/70">
          {section.caveat}
        </p>
      ) : null}
    </section>
  );
}
