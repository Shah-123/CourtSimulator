"""Diff the statute corpus against an official source document.

Corpus provisions in ``data/statutes/*.json`` were written from model knowledge
and start unverified. Flipping that flag is a legal judgement, so this tool
deliberately **never writes it** — it only puts the corpus text and the official
text side by side, with the substantive word-level differences marked, so a
human can make the call in seconds instead of minutes.

The flag is per provision (``sections[i].verified``), falling back to the
instrument-level ``verified`` for provisions that do not set one. Mark the ones
that matched; a provision still under review keeps the ⚠ without taking the rest
of its instrument down with it.

The expensive part of verification is not the decision, it is finding the
passage and spotting a dropped clause in a wall of statutory prose. That is the
part this automates.

    python scripts/verify-statutes.py constitution-1973 --source <official.pdf>
    python scripts/verify-statutes.py constitution-1973 --source <official.txt>
    python scripts/verify-statutes.py --list

Structural noise is ignored on purpose. The corpus stores one flowing paragraph
per provision while the official text numbers its clauses "(1) … (2)(a) …", so a
raw diff is almost entirely "(1)", "(a)", "—" and tells you nothing. Those
markers are stripped before comparison; what survives is words the two texts
genuinely disagree about, which is where a dropped limb or a changed threshold
shows up.

Requires PyMuPDF (``fitz``) or ``pypdf`` only when --source is a PDF.
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CORPUS_DIR = REPO_ROOT / "data" / "statutes"

# Clause markers, footnote references and the PDF's em-dash artefacts. These
# differ between the corpus's flowing prose and the official numbered text
# without either being wrong, so they are noise for this comparison.
_STRUCTURAL = re.compile(
    r"""
    \(\s*[0-9ivxa-z]{1,4}\s*\)   # (1) (a) (iv)
    | \[\s*[0-9]+\s*\]            # [2] amendment footnote anchors
    | ^\s*[0-9]+[A-Z]?\.\s*       # leading "10A."
    | [—–‒]        # em/en dashes
    | \*+                         # footnote stars
    """,
    re.VERBOSE | re.MULTILINE,
)


# Editorial apparatus printed inside the official PDFs: running page headers and
# the amendment footnotes that sit at the foot of each page. Neither is statutory
# text, and both otherwise land in the diff as "text the corpus omitted".
_APPARATUS = re.compile(
    r"""
    page\s+\d+\s+of\s+\d+
    # Footnote markers run straight into the word ("1Subs. by ...", "2Ins."),
    # so there is no word boundary to anchor on — the leading digits have to be
    # part of the pattern or the whole footnote survives into the diff.
    | \d*\s*(subs|ins|added|omitted|rep|sub-section)\.?\s+by\s+.{0,120}?(?=\s|$)
    | \d*\s*sub-section\b
    | \bact\s+[IVXLC]+\s+of\s+\d{4}
    | \b\d+\s+of\s+(18|19|20)\d{2}\b
    # Amendment citations the PDF prints as footnotes: "Constitution
    # (Eighteenth Amendment) Act, 2010 (Act No. X of 2010), s. 4", "XLIII of
    # 2016, s. 3", "Revival of the Constitution of 1973 Order, 1985 (P.O. ...)".
    | \b(act\s+)?no\.?\s+[IVXLC]+\s+of\s+\d{4}
    | \b[IVXLC]{1,7}\s+of\s+(18|19|20)\d{2}\b
    | \b\w+\s+amendment\b
    | \brevival\s+of\s+the\s+constitution\b
    | \bP\.?\s?O\.?\s+No\b
    """,
    re.VERBOSE | re.IGNORECASE,
)


# A delta that *opens* with a footnote marker is a footnote. Punctuation is
# already stripped by the time a chunk reaches here, so the citation cannot be
# matched as a sentence — but its first words are unmistakable.
_APPARATUS_OPENER = re.compile(
    # The marker digit can repeat once the asterisk run collapses: the delta
    # for QSO Art. 151 opens "1 1omitted clause of article 151 by s".
    r"^(?:\d+\s*)*(subs|ins|added|omitted|rep|sub-section|amdt)\b",
    re.IGNORECASE,
)


def is_apparatus(chunk: str) -> bool:
    """True when a reported delta is editorial apparatus rather than law."""
    if _APPARATUS_OPENER.match(chunk.strip()):
        return True
    # "constitution eighteenth amendment act 2010 act no x of 2010 s" and its
    # kin: an amendment citation names an instrument and a year and asserts no
    # legal proposition of its own.
    if re.search(r"\bamendment\b|\brevival of the constitution\b", chunk, re.I):
        return True
    # An amendment citation names an instrument and a year and says nothing
    # else; statutory text almost never reads that way.
    if re.search(r"\bamdt\b|\bordinance\b", chunk, re.IGNORECASE) and re.search(
        r"\b(18|19|20)\d{2}\b", chunk
    ):
        return True
    stripped = _APPARATUS.sub("", chunk).strip()
    # Mostly apparatus, or what remains is too short to be a legal proposition.
    return len(stripped) < max(12, len(chunk) * 0.4)


def fold(text: str) -> str:
    """Fold typographic characters to ASCII.

    Headings are matched literally, so a corpus heading written with a straight
    apostrophe ("Judge's power") silently fails against a PDF that sets a curly
    one — reported as a missing provision rather than a punctuation difference.
    """
    for src, dst in (
        ("’", "'"),
        ("‘", "'"),
        ("“", '"'),
        ("”", '"'),
        # U+037E GREEK QUESTION MARK. It renders as a semicolon and the
        # official CrPC sets one in the heading of s.162, so the corpus's
        # ordinary semicolon matched nothing and the provision was reported
        # missing from a document that plainly contains it. A lookalike
        # codepoint is the worst kind of mismatch: the diff you are shown to
        # explain the failure looks like a match.
        (";", ";"),   # GREEK QUESTION MARK, renders as a semicolon
        (" ", " "),   # NO-BREAK SPACE
        ("′", "'"),  # PRIME, renders as an apostrophe
    ):
        text = text.replace(src, dst)
    # Pages are joined with a newline, so a heading broken across a page break
    # comes back as "signed ; use of such statements" where the corpus has
    # "signed; use". The tokeniser splits on whitespace, so that stray space
    # made CrPC s.162 unfindable — reported as a missing provision rather than
    # as the typesetting artefact it is.
    return re.sub(r"\s+([;:,.])", r"\1", text)


def normalise(text: str) -> str:
    """Collapse a provision to comparable prose."""
    text = fold(text)
    text = _APPARATUS.sub(" ", text)
    text = _STRUCTURAL.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


def words(text: str) -> list[str]:
    return re.findall(r"[\w'-]+", normalise(text).lower())


# Spans set below this fraction of the document's dominant size are apparatus,
# not law. Measured across all three official PDFs: body text is 11-12pt and
# footnotes are 7-8pt, with nothing in between, so the boundary is a gap rather
# than a guess. 0.85 sits inside that gap for every one of them.
FOOTNOTE_SIZE_RATIO = 0.85


def _text_without_footnotes(doc) -> str:
    """Page text with the amendment footnotes dropped, by font size.

    Every remaining difference on the three unverified instruments was a
    footnote the extractor had inlined into the body — "Constitution (Twenty-
    first Amendment) Act, 2024, s. 16" arriving in the middle of Article 199 and
    being reported as text the corpus omitted. They cannot be filtered after the
    fact: ``normalise`` strips the word "Amendment" out of the citation before
    ``is_apparatus`` ever sees the chunk, so the evidence needed to recognise a
    footnote is destroyed upstream of the check for one.

    A footnote *rule* was the obvious anchor and does not work — only 18 of the
    Constitution's 176 pages print one and the Penal Code prints none. Size is
    what the typesetter actually used. Dropping small spans also removes the
    superscript markers that otherwise glue themselves to the following word
    ("1Subs." reaching the diff as part of the sentence).
    """
    sizes: dict[float, int] = {}
    for page in doc:
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    size = round(span["size"], 1)
                    sizes[size] = sizes.get(size, 0) + len(span["text"])
    if not sizes:
        return ""

    # Weighted by characters, not by span count: a heading is a whole span too,
    # and the body is whatever most of the document's *text* is set in.
    floor = max(sizes, key=lambda size: sizes[size]) * FOOTNOTE_SIZE_RATIO

    pages: list[str] = []
    for page in doc:
        lines: list[str] = []
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                kept = "".join(
                    span["text"]
                    for span in line.get("spans", [])
                    if span["size"] >= floor
                )
                if kept.strip():
                    lines.append(kept)
        pages.append("\n".join(lines))
    return "\n".join(pages)


def load_source(path: Path) -> str:
    """Read the official document as flat text."""
    if path.suffix.lower() != ".pdf":
        return path.read_text(encoding="utf-8", errors="replace")

    try:
        import pymupdf
    except ImportError:
        try:
            import fitz as pymupdf  # PyMuPDF < 1.24 exposed itself as `fitz`
        except ImportError:
            pymupdf = None

    if pymupdf is not None:
        with pymupdf.open(path) as doc:
            return _text_without_footnotes(doc)

    try:
        from pypdf import PdfReader
    except ImportError:  # pragma: no cover - dependency guidance
        sys.exit(
            "Reading a PDF source needs PyMuPDF or pypdf:\n"
            "    pip install pymupdf\n"
            "Alternatively pass a plain-text --source."
        )

    # pypdf is the fallback, not an equivalent. It exposes no font size, so
    # footnotes cannot be separated from the body, and its extraction breaks
    # words across line ends ("cross-examining" arriving as "cross examinin g")
    # and renders the hyphens in "qatl-i-amd" as U+00AD, which the heading match
    # does not treat as a hyphen. Both cost real matches: the Penal Code scored
    # 11/15 under pypdf and 13/15 under PyMuPDF on identical text.
    print(
        "warning: reading with pypdf — install pymupdf for footnote separation "
        "and accurate word breaks.",
        file=sys.stderr,
    )
    reader = PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


@dataclass
class Finding:
    number: str
    heading: str
    corpus: str
    official: str | None
    missing_from_corpus: list[str]
    added_by_corpus: list[str]
    anchor: str = "-"

    @property
    def status(self) -> str:
        if self.official is None:
            return "NOT FOUND"
        if not self.missing_from_corpus and not self.added_by_corpus:
            return "IDENTICAL"
        if self.missing_from_corpus:
            return "CORPUS OMITS TEXT"
        return "CORPUS ADDS TEXT"


def locate(flat: str, heading: str, number: str) -> tuple[int, int, str] | None:
    """Find the body occurrence of a provision, anchored on its heading.

    Bare section numbers repeat throughout schedules and legislative lists, so
    anchoring on the number lands in the wrong part of a long statute. Headings
    are distinctive. The table of contents prints each heading before the body
    does, so the *last* occurrence is the one wanted.

    Returns the (start, end) span of the heading itself; the body follows.
    """
    # Build patterns from tokens rather than escaping the whole heading:
    # re.escape backslashes spaces on some Python versions, which a later
    # whitespace substitution then mangles.
    tokens = [re.escape(t) for t in re.split(r"[\s\-]+", fold(heading).strip()) if t]
    if not tokens:
        return None
    head_pat = r"[\s\-]+".join(tokens)
    # "489-F" in the corpus may be printed "489F"; keep the separator optional.
    num_pat = r"[\s\-]*".join(re.escape(p) for p in re.split(r"[\s\-]+", number) if p)

    # Anchoring on the heading alone is not safe: "Theft" appears in the
    # illustrations to s.511, later in the document than s.378 itself, so the
    # last-occurrence rule lands in the wrong section. Number and heading
    # together are unique. The two source layouts print them in opposite
    # orders, so try both before falling back.
    for method, pattern in (
        ("number+heading", rf"\b{num_pat}\.\s*{head_pat}"),   # "378. Theft"  (PPC, CrPC)
        ("heading+number", rf"{head_pat}[\s\.]*{num_pat}\."),  # "Security of person 9."
    ):
        hits = list(re.finditer(pattern, flat, re.IGNORECASE))
        if hits:
            return (hits[-1].start(), hits[-1].end(), method)

    # Heading-only fallback. This finds the right *text* but proves nothing
    # about the *number*: QSO Art. 146 in the corpus is headed "Questions
    # lawful in cross-examination", which exists in the official text under a
    # different article. Matching on the heading alone would then report the
    # provision as identical while the citation the student is shown is wrong.
    hits = list(re.finditer(head_pat, flat, re.IGNORECASE))
    return (hits[-1].start(), hits[-1].end(), "heading-only") if hits else None


def body_after(flat: str, heading_end: int, number: str, window: int) -> str:
    """The provision's own text, cut before the next provision begins.

    Without the cut, the tail of the window is the *following* provision, and
    every one of its words is reported as text the corpus omitted — which buries
    the real omissions in noise.
    """
    chunk = flat[heading_end : heading_end + window]

    # Drop the provision's own repeated number marker ("9." after the heading).
    chunk = re.sub(rf"^\s*{re.escape(number)}\.\s*", " ", chunk)

    # Cut at the next provision. The boundary is a number-dot followed by a
    # capitalised heading word. Matching on "a number different from this one"
    # is not enough: the official Constitution prints Art. 25A under a stray
    # "25." heading, so Art. 25 swallowed the right-to-education article.
    # Clause markers inside a body are parenthesised — "(2)", "(a)" — so they
    # do not trip this.
    # An amended provision is printed inside its amendment brackets — s.375A
    # appears as "1[375A. Gang rape" — so the number is not preceded by plain
    # whitespace and a whitespace-anchored boundary runs straight past it.
    # A provision ends at whichever comes first: the next provision, or the
    # next structural division. Taking the first rule that matches rather than
    # the earliest position is what let "CHAPTER V OF DOCUMENTARY EVIDENCE"
    # ride along inside Art. 71 — the number cut fired on the following "72."
    # and carried the heading that sat between them.
    #
    # The division bound has to apply to the *diff's* view of the official text
    # as well as to emitted text. Cut it on one side only and the corpus reads
    # as though it were missing a chapter heading it should never contain.
    ends = [
        m.start()
        # The contents list prints "46A." but the body prints "46-A.", so the
        # suffix separator has to be optional or Art. 46 runs on and swallows
        # the whole of Art. 46-A.
        for m in re.finditer(r"(?:^|[\s\[])\d*\[?\s?\d+(?:\s?-\s?)?[A-Z]?\.\s+[A-Z]", chunk)
        if m.start() > 40
    ]
    division = re.search(r"\s(?:CHAPTER|PART)\s+[IVXLC]+\b|\s(?:[—–-]\s*){3,}", chunk)
    if division and division.start() > 40:
        ends.append(division.start())

    return chunk[: min(ends)] if ends else chunk


def compare(corpus_text: str, official_text: str) -> tuple[list[str], list[str]]:
    """Word-level delta, ignoring pure reordering of identical runs."""
    a, b = words(official_text), words(corpus_text)
    matcher = difflib.SequenceMatcher(None, a, b, autojunk=False)

    missing: list[str] = []
    added: list[str] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag in ("delete", "replace") and (i2 - i1) >= 3:
            chunk = " ".join(a[i1:i2])
            if not is_apparatus(chunk):
                missing.append(chunk)
        if tag in ("insert", "replace") and (j2 - j1) >= 3:
            chunk = " ".join(b[j1:j2])
            if not is_apparatus(chunk):
                added.append(chunk)
    return missing, added


def analyse(statute: dict, flat: str, window: int) -> list[Finding]:
    findings: list[Finding] = []
    for section in statute["sections"]:
        heading = section["heading"]
        number = section["sectionNumber"]
        span = locate(flat, heading, number)

        if span is None:
            findings.append(
                Finding(number, heading, section["content"], None, [], [])
            )
            continue

        # Read enough official text to cover the corpus passage. A fixed window
        # silently truncates long provisions — PPC s.375 runs to 2,200
        # characters, so a 2,000-character window reported its final proviso as
        # text the corpus had invented.
        budget = max(window, int(len(section["content"]) * 1.8) + 400)
        official = body_after(flat, span[1], number, budget)
        missing, added = compare(section["content"], official)
        findings.append(
            Finding(
                section["sectionNumber"], heading, section["content"],
                official, missing, added, span[2],
            )
        )
    return findings


def report(statute: dict, findings: list[Finding], verbose: bool) -> None:
    code = statute["statuteCode"]
    sections = statute["sections"]
    verified = sum(
        1 for s in sections if s.get("verified", statute["verified"])
    )
    print(f"\n{'=' * 78}\n{code} - {statute['statuteTitle']}")
    print(f"corpus verified:      {verified}/{len(sections)} provisions")
    print(f"corpus sourceUrl:     {statute['sourceUrl']}\n{'=' * 78}\n")

    for f in findings:
        flag = "  <- heading-only match: ARTICLE NUMBER UNCONFIRMED" if (
            f.anchor == "heading-only") else ""
        print(f"[{f.status:>17}]  {statute['citationUnit']}{f.number} - {f.heading}{flag}")
        if f.official is None:
            print("      heading not found in the source document\n")
            continue
        for chunk in f.missing_from_corpus:
            print(f"      - official has, corpus lacks: ...{chunk[:200]}...")
        for chunk in f.added_by_corpus:
            print(f"      + corpus has, official lacks: ...{chunk[:200]}...")
        if verbose:
            print(f"      CORPUS  : {normalise(f.corpus)[:400]}")
            print(f"      OFFICIAL: {normalise(f.official)[:400]}")
        print()

    counts: dict[str, int] = {}
    for f in findings:
        counts[f.status] = counts.get(f.status, 0) + 1
    print("-" * 78)
    print("  ".join(f"{status}: {n}" for status, n in sorted(counts.items())))
    print(
        "\nThis tool does not set `verified`. Read each flagged provision against\n"
        "the source, then edit data/statutes/*.json yourself and re-run\n"
        "`pnpm run statutes:reindex`.\n"
        "\n"
        'Mark a provision that matched with `"verified": true` on that section.\n'
        "Only set it on the instrument once every provision in it has been\n"
        "diffed — the instrument flag is the fallback, not a summary."
    )


def clean_official(text: str) -> str:
    """The official passage as corpus content: statute, not apparatus.

    Extraction is a starting point for a human, never a commit. It strips the
    footnote citations and running headers that the PDF interleaves with the
    text, and normalises the hyphenation the typesetter introduced at line
    breaks — but it cannot tell a genuine proviso from a stray fragment, so
    every emitted provision still has to be read against the source.
    """
    text = fold(text)

    # A page's footnotes are printed at its foot, so flattening drops the whole
    # block into the middle of whatever sentence spanned the page break. In PPC
    # s.415 five footnotes and a running header sit between "shall retain any"
    # and "property, or intentionally induces" — the provision reads as
    # nonsense and no amount of per-citation stripping repairs it, because the
    # damage is a block, not a citation. The block runs from its first marker
    # to the page header that follows it.
    text = re.sub(
        r"\s\d+(?:Subs|Ins|Rep|Omitted|Added|The\s+word)\b.*?Page\s+\d+\s+of\s+\d+\s*",
        " ",
        text,
    )

    # OCR reads "l" as "1" inside words: "dishonest1y", "liab1e". A digit
    # between two lowercase letters is not a number.
    text = re.sub(r"(?<=[a-z])1(?=[a-z])", "l", text)

    # Footnote citations: "1Subs. by the Law Reforms Ordinance, 1972 (12 of
    # 1972), s. 2 and Sch., for ...". They run to the end of a sentence.
    text = re.sub(
        r"\d*\s*(Subs|Ins|Added|Omitted|Rep|Sub-section)\.?\s+by\b[^.]*\.(\s*[^.]*\.)?",
        " ",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"Page\s+\d+\s+of\s+\d+", " ", text, flags=re.IGNORECASE)
    # Hyphenation carried over from a line break: "un-soundness" -> unsoundness.
    text = re.sub(r"\b(un|non|pre|re)-(?=[a-z])", r"\1", text)
    # The PDF renders an em dash as "__" and leaves amendment brackets behind.
    text = text.replace("__", "— ").replace("[", "").replace("]", "")
    # Footnotes sit at the foot of the page and land *after* the provision once
    # the page is flattened, so stripping them inline is not enough — the tail
    # has to be cut. A footnote opens with its marker digit run into a capital
    # word ("3Subs. by", "1Omitted clause (4)", "8Sub-sections (3) and (4)").
    cut = re.search(
        r"\s\d+(Subs|Ins|Omitted|Added|Rep|Clause|Sub-section|Substituted|The\s+words)\b"
        r"|Page\s+\d+\s+of\s+\d+"
        r"|may be perused in the chronological sequence"
        # A provision ends where the next structural division begins. These
        # slipped through the diff rather than being caught by it: the official
        # window contains the chapter heading too, so both sides agreed and the
        # provision read IDENTICAL with "CHAPTER V OF DOCUMENTARY EVIDENCE"
        # sitting inside its text. Agreement is not correctness.
        r"|\s(?:CHAPTER|PART)\s+[IVXLC]+\b"
        r"|\s(?:[—–-]\s*){3,}",
        text,
    )
    if cut and cut.start() > 60:
        text = text[: cut.start()]

    text = re.sub(r"\s*([,;.])", r"\1", text)
    text = re.sub(r"\s+", " ", text).strip()
    # Asterisk runs mark text an amendment removed; they carry no words.
    text = re.sub(r"(\s\*)+\s*", " ", text)
    # The body begins after the heading, so the separator the PDF prints
    # between them ("Primary evidence.— \"Primary evidence\" means…") is left
    # dangling at the front.
    return re.sub(r"^[\s.,;:—–-]+", "", text)


def emit(statute: dict, flat: str, window: int) -> None:
    """Print the official text of every provision, as JSON, for review.

    Only provisions the tool could anchor are emitted. A provision it cannot
    find is reported as such rather than guessed at, because a confidently
    wrong provision is the failure this whole exercise exists to prevent.
    """
    out: list[dict] = []
    for section in statute["sections"]:
        number = section["sectionNumber"]
        span = locate(flat, section["heading"], number)

        if span is None:
            # Heading mismatch. Fall back to the number, and report the heading
            # the official text actually prints so it can be corrected.
            num_pat = r"[\s\-]*".join(
                re.escape(p) for p in re.split(r"[\s\-]+", number) if p
            )
            hits = list(re.finditer(rf"(?:^|[\s\[]){num_pat}\.\s+([A-Z][^.]{{4,110}})\.", flat))
            if not hits:
                out.append({"sectionNumber": number, "error": "not located"})
                continue
            m = hits[-1]
            out.append(
                {
                    "sectionNumber": number,
                    "corpusHeading": section["heading"],
                    "officialHeading": " ".join(m.group(1).split()),
                    "content": clean_official(
                        body_after(flat, m.end(), number, window)
                    ),
                    "anchor": "number-only — CHECK THE HEADING",
                }
            )
            continue

        # Emit reads wider than the diff does. A provision's Illustrations and
        # trailing provisos sit past the end of whatever the corpus currently
        # holds, and the point of emitting is to recover the text the corpus is
        # missing — a window sized to what is already there would find none.
        budget = max(window, int(len(section["content"]) * 3) + 1500)
        out.append(
            {
                "sectionNumber": number,
                "corpusHeading": section["heading"],
                "content": clean_official(body_after(flat, span[1], number, budget)),
                "anchor": span[2],
            }
        )

    print(json.dumps(out, ensure_ascii=False, indent=2))


def main() -> None:
    # Statutory PDFs carry typographic characters the Windows console codepage
    # cannot encode; without this the run dies partway through a report.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("statute", nargs="?", help="corpus file stem, e.g. constitution-1973")
    parser.add_argument("--source", type=Path, help="official PDF or text document")
    parser.add_argument("--list", action="store_true", help="list corpus files and exit")
    parser.add_argument("--verbose", action="store_true", help="print both texts in full")
    parser.add_argument(
        "--emit",
        action="store_true",
        help="print the official text of each provision as JSON, for review",
    )
    parser.add_argument(
        "--window",
        type=int,
        default=2000,
        help="characters of official text to read from each heading (default 2000)",
    )
    args = parser.parse_args()

    if args.list or not args.statute:
        print("Corpus files:")
        for path in sorted(CORPUS_DIR.glob("*.json")):
            data = json.loads(path.read_text(encoding="utf-8"))
            print(
                f"  {path.stem:24s} {len(data['sections']):3d} provisions   "
                f"verified={data['verified']}"
            )
        if not args.statute:
            return

    path = CORPUS_DIR / f"{args.statute}.json"
    if not path.exists():
        sys.exit(f"No such corpus file: {path}")
    if not args.source:
        sys.exit("--source is required (the official PDF or text of this statute)")
    if not args.source.exists():
        sys.exit(f"No such source document: {args.source}")

    statute = json.loads(path.read_text(encoding="utf-8"))
    flat = fold(re.sub(r"\s+", " ", load_source(args.source)))
    if args.emit:
        emit(statute, flat, args.window)
        return
    report(statute, analyse(statute, flat, args.window), args.verbose)


if __name__ == "__main__":
    main()
