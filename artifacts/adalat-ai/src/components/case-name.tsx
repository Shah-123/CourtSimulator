/**
 * A case name, set the way a law report sets it.
 *
 * The "v." between two parties is the most recognisable typographic form in
 * law, and rendering it as ordinary text throws that away. Roman for the
 * parties, small italic for the versus — a lawyer reads the shape before the
 * words. Titles that carry no "v." (a writ petition, a reference) are left
 * exactly as they are rather than forced into a form they do not have.
 *
 * Shared rather than local to the case library: the appearances list, the
 * chambers summary and the courtroom header all print the same titles, and
 * three of them were setting them as flat strings.
 */
export function CaseName({ title }: { title: string }) {
  const parts = title.split(/\s+v\.?\s+/);
  if (parts.length !== 2) return <>{title}</>;

  return (
    <>
      {parts[0]} <span className="font-normal italic text-muted-foreground">v.</span>{' '}
      {parts[1]}
    </>
  );
}
