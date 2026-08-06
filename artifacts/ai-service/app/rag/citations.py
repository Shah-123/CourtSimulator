"""Citation extraction and verification.

This is the guard that stops the simulator teaching students statute numbers
that do not exist. It runs over model output (generated cases, objection
rulings) and over student arguments alike, so both sides of the courtroom are
held to the same standard.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum

from app.rag.index import get_index

# Aliases students and models actually use, lowercased. Order matters: longer,
# more specific aliases must be tried first so "code of criminal procedure" is
# not partially matched by a shorter entry.
INSTRUMENT_ALIASES: list[tuple[str, list[str]]] = [
    (
        "QSO_1984",
        [
            "qanun-e-shahadat order",
            "qanun e shahadat order",
            "qanun-e-shahadat",
            "qanun e shahadat",
            "qso",
        ],
    ),
    (
        "CRPC_1898",
        [
            "code of criminal procedure",
            "criminal procedure code",
            "cr.p.c",
            "crpc",
            "cr p c",
        ],
    ),
    ("PPC_1860", ["pakistan penal code", "penal code", "ppc"]),
    ("CONST_1973", ["constitution of pakistan", "constitution"]),
]

_ALIAS_TO_CODE = {
    alias: code for code, aliases in INSTRUMENT_ALIASES for alias in aliases
}
_ALIAS_PATTERN = "|".join(
    re.escape(alias) for _, aliases in INSTRUMENT_ALIASES for alias in aliases
)

# Matches "302", "489-F", "10A", "265-K".
_PROVISION_NUMBER = r"\d+(?:\s*-\s*[A-Za-z]|[A-Za-z])?"
_PROVISION_WORD = r"(?:s\.?|sec\.?|section|art\.?|article)"

# "PPC 1860 s.302", "QSO Art. 17"
_INSTRUMENT_FIRST = re.compile(
    rf"({_ALIAS_PATTERN})[,\s]*(?:\d{{4}})?[,\s]*{_PROVISION_WORD}\s*"
    rf"({_PROVISION_NUMBER})",
    re.IGNORECASE,
)
# "section 302 of the PPC", "Article 17 QSO"
_PROVISION_FIRST = re.compile(
    rf"{_PROVISION_WORD}\s*({_PROVISION_NUMBER})\s*(?:,\s*)?(?:of\s+)?(?:the\s+)?"
    rf"({_ALIAS_PATTERN})",
    re.IGNORECASE,
)


class CitationStatus(StrEnum):
    VERIFIED = "verified"
    """The provision exists and its text was retrieved."""
    NOT_FOUND = "not_found"
    """The instrument is in the corpus but has no such provision."""
    UNCOVERED = "uncovered"
    """The instrument itself is outside the indexed corpus."""


@dataclass(slots=True)
class CitationCheck:
    raw: str
    statute_code: str
    section_number: str
    citation: str | None
    status: CitationStatus
    heading: str | None
    content: str | None
    source_url: str | None
    verified_source: bool

    def to_dict(self) -> dict:
        return {
            "raw": self.raw,
            "statuteCode": self.statute_code,
            "sectionNumber": self.section_number,
            "citation": self.citation,
            "status": str(self.status),
            "heading": self.heading,
            "content": self.content,
            "sourceUrl": self.source_url,
            "verifiedSource": self.verified_source,
        }


def _normalise_number(raw: str) -> str:
    """"489 - f" and "489-F" are the same provision; "10a" is "10A"."""
    return re.sub(r"\s*-\s*", "-", raw).upper().strip()


def extract_citations(text: str) -> list[tuple[str, str, str]]:
    """Pulls every statutory citation out of free text, de-duplicated.

    Returns (raw, statute_code, section_number) triples.
    """
    found: dict[str, tuple[str, str, str]] = {}

    def collect(match: re.Match, alias_group: int, number_group: int) -> None:
        code = _ALIAS_TO_CODE.get(match.group(alias_group).lower().strip())
        if code is None:
            return
        number = _normalise_number(match.group(number_group))
        found.setdefault(f"{code}:{number}", (match.group(0).strip(), code, number))

    for match in _INSTRUMENT_FIRST.finditer(text):
        collect(match, 1, 2)
    for match in _PROVISION_FIRST.finditer(text):
        collect(match, 2, 1)

    return list(found.values())


async def verify_citations(text: str) -> list[CitationCheck]:
    """Checks every citation in a block of text against the indexed corpus."""
    extracted = extract_citations(text)
    if not extracted:
        return []

    index = await get_index()
    covered = index.statute_codes()
    by_key = {
        f"{section.statute_code}:{section.section_number.upper()}": section
        for section in index.sections
    }

    checks: list[CitationCheck] = []
    for raw, code, number in extracted:
        if code not in covered:
            checks.append(
                CitationCheck(
                    raw=raw,
                    statute_code=code,
                    section_number=number,
                    citation=None,
                    status=CitationStatus.UNCOVERED,
                    heading=None,
                    content=None,
                    source_url=None,
                    verified_source=False,
                )
            )
            continue

        section = by_key.get(f"{code}:{number}")
        if section is None:
            checks.append(
                CitationCheck(
                    raw=raw,
                    statute_code=code,
                    section_number=number,
                    citation=None,
                    status=CitationStatus.NOT_FOUND,
                    heading=None,
                    content=None,
                    source_url=None,
                    verified_source=False,
                )
            )
            continue

        checks.append(
            CitationCheck(
                raw=raw,
                statute_code=section.statute_code,
                section_number=section.section_number,
                citation=section.citation,
                status=CitationStatus.VERIFIED,
                heading=section.heading,
                content=section.content,
                source_url=section.source_url,
                verified_source=section.verified,
            )
        )

    return checks


@dataclass(slots=True)
class CitationAudit:
    checks: list[CitationCheck]
    total: int
    verified: int
    hallucinated: int
    accuracy: int | None
    """0-100, or None when no citations were made."""


async def audit_citations(text: str) -> CitationAudit:
    checks = await verify_citations(text)
    total = len(checks)
    verified = sum(1 for c in checks if c.status is CitationStatus.VERIFIED)
    hallucinated = sum(1 for c in checks if c.status is CitationStatus.NOT_FOUND)
    return CitationAudit(
        checks=checks,
        total=total,
        verified=verified,
        hallucinated=hallucinated,
        accuracy=None if total == 0 else round(verified / total * 100),
    )


def format_audit_for_prompt(audit: CitationAudit) -> str:
    """Renders an audit as a prompt block for the judge to reason over."""
    if audit.total == 0:
        return (
            "The student cited no statutory provisions at any point in this session."
        )

    lines = []
    for check in audit.checks:
        if check.status is CitationStatus.VERIFIED:
            lines.append(f'- "{check.raw}" → EXISTS: {check.citation} ({check.heading})')
        elif check.status is CitationStatus.NOT_FOUND:
            lines.append(
                f'- "{check.raw}" → DOES NOT EXIST. '
                "No such provision in this instrument."
            )
        else:
            lines.append(
                f'- "{check.raw}" → instrument not in the verified corpus; '
                "treat as unconfirmed."
            )

    return (
        "Citation check performed against the statute database (this is ground "
        "truth, not your opinion):\n"
        + "\n".join(lines)
        + f"\n\n{audit.verified}/{audit.total} citations resolve to real provisions."
    )
