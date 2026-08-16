import type { BriefItem, CaseBriefDetail } from "@workspace/api-client-react";

/**
 * The pleading behind a case, set as a filing rather than as prose.
 *
 * `summary` orients the reader; this is what the student actually argues from.
 * Numbered facts, lettered grounds and an itemised prayer are the shape a
 * Pakistani filing takes, and keeping that shape is the point — a student who
 * has read this brief knows which propositions the bench can press them on.
 *
 * No `stamp` or `seal` appears here. Every ground survived the citation audit
 * before the case was stored, so there is nothing outstanding to mark, and
 * spending a reserved colour on decoration would blunt it where it does count.
 */
function ItemList({
  items,
  render,
}: {
  items: BriefItem[];
  render: (label: string) => string;
}) {
  return (
    <ol className="mt-2 divide-y divide-rule/70">
      {items.map((item, idx) => (
        <li key={idx} className="flex gap-3 py-2.5">
          <span className="w-7 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">
            {render(item.label)}
          </span>
          <p className="font-serif leading-relaxed text-foreground/85">
            {item.text}
          </p>
        </li>
      ))}
    </ol>
  );
}

/**
 * Grounds and prayer only, for the session sidebar.
 *
 * Mid-argument the student does not need the cause number or the array of
 * parties — they need the propositions they are defending and the relief they
 * are asking for, which is precisely what the bench is pressing them on.
 */
export function CaseBriefArgument({ brief }: { brief: CaseBriefDetail }) {
  if (brief.grounds.length === 0 && brief.prayer.length === 0) return null;

  return (
    <div className="mt-5 space-y-4 border-t border-rule pt-4">
      {brief.grounds.length > 0 && (
        <div>
          <p className="apparatus text-muted-foreground">Grounds</p>
          <ol className="mt-1.5 space-y-1.5">
            {brief.grounds.map((item, idx) => (
              <li key={idx} className="flex gap-2 text-sm leading-relaxed">
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {item.label}.
                </span>
                <span className="font-serif text-foreground/85">{item.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {brief.prayer.length > 0 && (
        <div>
          <p className="apparatus text-muted-foreground">Prayer</p>
          <ol className="mt-1.5 space-y-1.5">
            {brief.prayer.map((item, idx) => (
              <li key={idx} className="flex gap-2 text-sm leading-relaxed">
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  ({item.label})
                </span>
                <span className="font-serif text-foreground/85">{item.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export function CaseBriefSheet({ brief }: { brief: CaseBriefDetail }) {
  // Co-parties only: the lead petitioner and respondent are already set out
  // above this, off the case record's own columns.
  const coPetitioners = brief.petitioners.slice(1);
  const coRespondents = brief.respondents.slice(1);
  const hasCoParties = coPetitioners.length > 0 || coRespondents.length > 0;

  const heading = [brief.court, brief.caseNumber].filter(Boolean).join(" · ");

  return (
    <>
      {(heading || brief.jurisdictionInvoked) && (
        <section className="border-y border-rule py-3">
          {heading && <p className="apparatus text-muted-foreground">{heading}</p>}
          {brief.jurisdictionInvoked && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              Jurisdiction invoked: {brief.jurisdictionInvoked}
            </p>
          )}
        </section>
      )}

      {hasCoParties && (
        <section>
          <h3 className="apparatus border-b border-rule pb-2 text-muted-foreground">
            Also arrayed
          </h3>
          <ul className="divide-y divide-rule/70">
            {[...coPetitioners, ...coRespondents].map((party, idx) => (
              <li key={idx} className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="font-serif">{party.name}</span>
                <span className="apparatus shrink-0 text-muted-foreground">
                  {party.role}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {brief.facts.length > 0 && (
        <section>
          <h3 className="apparatus border-b border-rule pb-2 text-muted-foreground">
            Facts as pleaded
          </h3>
          <ItemList items={brief.facts} render={(label) => `${label}.`} />
        </section>
      )}

      {brief.grounds.length > 0 && (
        <section>
          <h3 className="apparatus border-b border-rule pb-2 text-muted-foreground">
            Grounds ({brief.grounds.length})
          </h3>
          <p className="mt-1.5 text-xs text-muted-foreground">
            The propositions this case stands on. The bench will press you on
            these.
          </p>
          <ItemList items={brief.grounds} render={(label) => `${label}.`} />
        </section>
      )}

      {brief.prayer.length > 0 && (
        <section>
          <h3 className="apparatus border-b border-rule pb-2 text-muted-foreground">
            Prayer
          </h3>
          <ItemList items={brief.prayer} render={(label) => `(${label})`} />
        </section>
      )}
    </>
  );
}
