import { cn } from "@/lib/utils";

/**
 * What the court is saying, and the provenance of anything it cites.
 *
 * Shared by the live voice session and the recorded-run replay. Both render the
 * same thing for the same reason: speech cannot carry the written record's
 * warning badge, so where an agent relied on a provision whose text has not been
 * checked against pakistancode.gov.pk, the caption says so beside the words
 * being spoken. Kept in one place deliberately — if the replay drew its own
 * caption the two could disagree about when a warning is shown, and the replay
 * is the one an audience sees.
 */

/**
 * One agent taking the floor. A single spoken turn can produce several of these
 * in sequence — counsel objects, the bench rules, then the witness answers —
 * so the caption has to say who is speaking rather than assume the bench.
 */
export interface SpeakerCue {
  speaker: "judge" | "opposing_counsel" | "witness";
  kind: "objection" | "ruling" | "testimony" | "bench" | "argument";
  witnessName: string | null;
  citation: string | null;
  ruling: "sustained" | "overruled" | null;
  /** Provenance of anything this agent cited; drives the unverified warning. */
  grounded: { citation: string; heading: string; verified: boolean }[];
  /**
   * Citations the audit could not find in the corpus at all. Checked before the
   * line was spoken, so the warning is on screen while the student hears it.
   */
  fabricated: string[];
  /**
   * The bench's ReAct trace, arriving with the ruling rather than after it, so
   * a student hearing "sustained" can see what the judge read to get there
   * while it is still being said.
   */
  reasoning: { thought: string; action: string; observation: string }[];
}

export function speakerLabel(cue: SpeakerCue): string {
  if (cue.speaker === "witness") {
    return cue.witnessName ? `Witness — ${cue.witnessName}` : "The witness";
  }
  return cue.speaker === "judge" ? "The Bench" : "Opposing counsel";
}

export function LiveCaption({ cue, text }: { cue: SpeakerCue; text: string }) {
  const isObjection = cue.kind === "objection";
  const isRuling = cue.kind === "ruling";
  const hasUnverified = cue.grounded.some((provision) => !provision.verified);

  return (
    <div
      data-mark={isObjection ? "objection" : isRuling ? "ruling" : "bench"}
      className="record-entry py-2 pr-2"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={cn(
            "apparatus",
            isObjection ? "text-stamp" : isRuling ? "text-primary" : "text-foreground/70",
          )}
        >
          {speakerLabel(cue)}
          {isObjection ? " · objection" : ""}
          {isRuling && cue.ruling ? ` · ${cue.ruling}` : ""}
        </span>

        {cue.citation && (
          <span className="font-mono text-xs text-foreground/70">
            {cue.citation}
          </span>
        )}

        {hasUnverified && (
          <span
            className="apparatus text-stamp"
            title="This provision's text has not been checked against pakistancode.gov.pk. Do not quote it as authoritative."
          >
            ⚠ unverified
          </span>
        )}

        {cue.fabricated.length > 0 && (
          <span
            className="apparatus text-stamp"
            title={`Not found in the statute corpus: ${cue.fabricated.join(", ")}`}
          >
            ⚠ not in corpus: {cue.fabricated.join(", ")}
          </span>
        )}
      </div>

      {text && (
        <p className="mt-1.5 font-serif text-sm leading-relaxed text-foreground/85">
          {text}
        </p>
      )}

      {/* Shown open rather than collapsed: live, this is the bench reading
          statute while it speaks, and it is only on screen for the length of
          the ruling. The written record collapses the same trace, because
          there it is reference rather than event. */}
      {cue.reasoning.length > 0 && (
        <ol className="mt-2 space-y-1.5 border-l border-rule pl-3">
          {cue.reasoning.map((step, index) => (
            <li key={index} className="space-y-0.5">
              {step.action && (
                <p className="break-all font-mono text-[0.7rem] leading-snug text-primary">
                  {step.action}
                </p>
              )}
              {step.observation && (
                <p className="font-serif text-xs leading-snug text-foreground/55">
                  {step.observation}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
