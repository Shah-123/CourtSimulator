"""Generates the CourtSimulator pitch brief as a PDF.

The third document in the docs/ set, and the only one written for someone who
is not an engineer. `generate_technical_guide_pdf.py` is the defence brief and
`generate_technical_notes_pdf.py` is the engineering notebook; this one is what
you read the night before you present, and what you speak from on the day.

Everything here is plain English on purpose. No jargon survives unless it is
immediately cashed out in ordinary words, because the failure mode of a pitch
is not being wrong, it is being unfollowable.

    python scripts/generate_pitch_pdf.py

Output: docs/CourtSimulator_Pitch_Brief.pdf

Figures are quoted from docs/evaluation.md as measured. Where a number moved
between configurations, the row matching the *shipped* code is the one used --
see the cost note in part_numbers().

Text is rendered with the built-in Type1 fonts, whose WinAnsi encoding has no
arrow glyph, so the prose uses "->" throughout rather than acquiring a font
dependency for punctuation.
"""

from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as _canvas
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

INK = colors.HexColor("#101828")
NAVY = colors.HexColor("#1b3a5c")
ACCENT = colors.HexColor("#8a2b2b")
GREEN = colors.HexColor("#255b48")
MUTED = colors.HexColor("#5b626c")
RULE = colors.HexColor("#d7dbe0")
CODE_BG = colors.HexColor("#f4f5f7")
BLOCK_BG = colors.HexColor("#faf7f2")
SAY_BG = colors.HexColor("#eef4f0")
TABLE_ALT = colors.HexColor("#f7f8fa")

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

BODY = ParagraphStyle(
    "body",
    fontName="Helvetica",
    fontSize=9.6,
    leading=14.4,
    textColor=INK,
    alignment=TA_JUSTIFY,
    spaceAfter=7,
)
BODY_TIGHT = ParagraphStyle("bodyTight", parent=BODY, spaceAfter=3)
SMALL = ParagraphStyle("small", parent=BODY, fontSize=8.2, leading=11.6,
                       textColor=MUTED)
LEAD = ParagraphStyle("lead", parent=BODY, fontSize=10.6, leading=16,
                      textColor=NAVY, spaceAfter=10)

H1 = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=19, leading=23,
                    textColor=NAVY, spaceAfter=2)
H1_KICKER = ParagraphStyle("h1k", fontName="Helvetica-Bold", fontSize=8.5,
                           leading=11, textColor=ACCENT, spaceAfter=3)
H2 = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=12.8, leading=16,
                    textColor=NAVY, spaceBefore=13, spaceAfter=5)
H3 = ParagraphStyle("h3", fontName="Helvetica-Bold", fontSize=10.4, leading=13.5,
                    textColor=ACCENT, spaceBefore=10, spaceAfter=3)
CODE = ParagraphStyle("code", fontName="Courier", fontSize=7.9, leading=10.6,
                      textColor=INK, spaceAfter=0)
CELL = ParagraphStyle("cell", parent=BODY, fontSize=8.4, leading=11.8,
                      alignment=0, spaceAfter=0)
CELL_H = ParagraphStyle("cellH", parent=CELL, fontName="Helvetica-Bold",
                        textColor=colors.white)
LABEL = ParagraphStyle("label", parent=CELL, fontName="Helvetica-Bold",
                       textColor=ACCENT, fontSize=7.6)
SAY = ParagraphStyle("say", parent=BODY, fontName="Helvetica-Oblique",
                     fontSize=10, leading=15, textColor=NAVY, alignment=0,
                     spaceAfter=0)
STEPNUM = ParagraphStyle("stepnum", fontName="Helvetica-Bold", fontSize=21,
                         leading=23, textColor=colors.white,
                         alignment=TA_CENTER)
STEPTITLE = ParagraphStyle("steptitle", parent=BODY, fontName="Helvetica-Bold",
                           fontSize=11.4, leading=14.4, textColor=NAVY,
                           alignment=0, spaceAfter=3)
QUESTION = ParagraphStyle("q", parent=BODY, fontName="Helvetica-Bold",
                          fontSize=9.8, leading=13.6, textColor=NAVY,
                          alignment=0, spaceBefore=9, spaceAfter=3)
COVER_TITLE = ParagraphStyle("coverTitle", fontName="Helvetica-Bold",
                             fontSize=32, leading=37, textColor=NAVY,
                             alignment=TA_CENTER)
COVER_SUB = ParagraphStyle("coverSub", fontName="Helvetica", fontSize=13,
                           leading=19, textColor=ACCENT, alignment=TA_CENTER)
COVER_META = ParagraphStyle("coverMeta", fontName="Helvetica", fontSize=9.2,
                            leading=14.5, textColor=MUTED, alignment=TA_CENTER)


def x(text: str) -> str:
    """Escapes the three characters reportlab's mini-markup parser owns."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def p(text: str, style: ParagraphStyle = BODY):
    return Paragraph(text, style)


def h1(kicker: str, title: str):
    return [
        PageBreak(),
        Paragraph(kicker.upper(), H1_KICKER),
        Paragraph(title, H1),
        HRFlowable(width="100%", thickness=1.4, color=NAVY, spaceBefore=4,
                   spaceAfter=10),
    ]


def h2(title: str):
    return Paragraph(title, H2)


def h3(title: str):
    return Paragraph(title, H3)


def bullets(items, style=BODY_TIGHT):
    return [ListFlowable(
        [ListItem(Paragraph(item, style), leftIndent=10) for item in items],
        bulletType="bullet",
        bulletFontSize=7,
        bulletOffsetY=-1,
        leftIndent=12,
        spaceAfter=8,
    )]


def numbered(items, style=BODY_TIGHT):
    return [ListFlowable(
        [ListItem(Paragraph(item, style), leftIndent=12) for item in items],
        bulletType="1",
        bulletFontName="Helvetica-Bold",
        bulletFontSize=8.8,
        leftIndent=14,
        spaceAfter=8,
    )]


def code(text: str):
    """A fixed-width block on a tinted panel."""
    # Every space becomes non-breaking: reportlab collapses runs of whitespace
    # and strips leading ones, which would destroy an ASCII diagram.
    lines = [Paragraph(x(line).replace(" ", "&nbsp;") or "&nbsp;", CODE)
             for line in text.strip("\n").split("\n")]
    flow = Table([[lines]], colWidths=[CONTENT_W])
    flow.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
        ("BOX", (0, 0), (-1, -1), 0.5, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return [flow, Spacer(1, 8)]


def table(headers, rows, widths, caption=None):
    data = [[Paragraph(cell, CELL_H) for cell in headers]]
    for row in rows:
        data.append([Paragraph(cell, CELL) for cell in row])

    total = float(sum(widths))
    col_widths = [CONTENT_W * (w / total) for w in widths]

    style = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), TABLE_ALT))

    flow = Table(data, colWidths=col_widths, repeatRows=1)
    flow.setStyle(TableStyle(style))
    out = [flow]
    if caption:
        out.append(Spacer(1, 3))
        out.append(Paragraph(caption, SMALL))
    out.append(Spacer(1, 9))
    return out


def step(number, title, body_paras):
    """One numbered station in the walkthrough: big numeral, title, prose."""
    num = Table([[Paragraph(str(number), STEPNUM)]], colWidths=[13 * mm],
                rowHeights=[13 * mm])
    num.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    right = [Paragraph(title, STEPTITLE)]
    for para in body_paras:
        right.append(Paragraph(para, ParagraphStyle("stepbody", parent=BODY,
                                                    spaceAfter=5)))

    flow = Table([[num, right]],
                 colWidths=[15 * mm, CONTENT_W - 15 * mm])
    flow.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 6),
        ("LEFTPADDING", (1, 0), (1, 0), 2),
        ("RIGHTPADDING", (1, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [flow, Spacer(1, 11)]


def say(text, label="SAY THIS"):
    """A line to speak out loud on the day."""
    flow = Table([[Paragraph(label, ParagraphStyle("sl", parent=LABEL,
                                                   textColor=GREEN)),
                   Paragraph('"' + text + '"', SAY)]],
                 colWidths=[CONTENT_W * 0.14, CONTENT_W * 0.86])
    flow.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SAY_BG),
        ("LINEBEFORE", (0, 0), (0, -1), 2.4, GREEN),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return [flow, Spacer(1, 10)]


def note(text, label="NOTE"):
    flow = Table([[Paragraph(label, ParagraphStyle("nl", parent=LABEL,
                                                   textColor=NAVY)),
                   Paragraph(text, CELL)]],
                 colWidths=[CONTENT_W * 0.14, CONTENT_W * 0.86])
    flow.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eef2f6")),
        ("LINEBEFORE", (0, 0), (0, -1), 2.2, NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return [flow, Spacer(1, 9)]


_QA = {"n": 0}


def qa(question, answer):
    _QA["n"] += 1
    block = [
        Paragraph("Q%d. %s" % (_QA["n"], question), QUESTION),
        Paragraph(answer, BODY),
        HRFlowable(width="100%", thickness=0.4, color=RULE,
                   spaceBefore=1, spaceAfter=2),
    ]
    return [KeepTogether(block)] if len(answer) < 900 else block


class NumberedCanvas(_canvas.Canvas):
    """Two-pass canvas: page N of M can only be drawn once M is known."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved = []

    def showPage(self):
        self._saved.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved)
        for state in self._saved:
            self.__dict__.update(state)
            self._decorate(total)
            super().showPage()
        super().save()

    def _decorate(self, total):
        if self._pageNumber == 1:
            return
        self.saveState()
        self.setFont("Helvetica", 7.4)
        self.setFillColor(MUTED)
        self.drawString(MARGIN, PAGE_H - MARGIN + 8, "CourtSimulator")
        self.drawRightString(PAGE_W - MARGIN, PAGE_H - MARGIN + 8,
                             "Pitch brief - the full flow in plain English")
        self.setStrokeColor(RULE)
        self.setLineWidth(0.4)
        self.line(MARGIN, PAGE_H - MARGIN + 4, PAGE_W - MARGIN,
                  PAGE_H - MARGIN + 4)
        self.line(MARGIN, MARGIN - 10, PAGE_W - MARGIN, MARGIN - 10)
        self.drawCentredString(PAGE_W / 2, MARGIN - 19,
                               "%d of %d" % (self._pageNumber, total))
        self.restoreState()


# ---------------------------------------------------------------------------
# Content
# ---------------------------------------------------------------------------


def part_cover():
    return [
        Spacer(1, 46 * mm),
        Paragraph("CourtSimulator", COVER_TITLE),
        Spacer(1, 5 * mm),
        Paragraph("A voice-first moot court for Pakistani law students",
                  COVER_SUB),
        Spacer(1, 3 * mm),
        HRFlowable(width="42%", thickness=1.2, color=ACCENT,
                   hAlign="CENTER"),
        Spacer(1, 8 * mm),
        Paragraph(
            "Pitch brief - the full flow, in plain English<br/>"
            "Written to be read the night before, and spoken from on the day",
            COVER_META),
        Spacer(1, 60 * mm),
        Paragraph(
            "Three AI agents hold a hearing against you.<br/>"
            "Every provision they cite is checked against the statute book "
            "before it is spoken.", COVER_META),
        Spacer(1, 14 * mm),
        Paragraph("Generated from the repository - figures as measured",
                  COVER_META),
    ]


def part_sixty_seconds():
    s = h1("Start here", "The sixty-second version")
    s.append(p(
        "If you get one minute and nothing else, this is the minute.", LEAD))

    s += say(
        "Law students in Pakistan graduate having argued almost nothing out "
        "loud. A moot court needs a judge, an opponent, a witness and a room, "
        "so most students get a handful of practices in five years. "
        "CourtSimulator gives them a courtroom they can walk into alone. You "
        "speak; a judge, an opposing lawyer and a witness answer back in real "
        "voices. The opposing lawyer objects when you ask a bad question, the "
        "judge looks up the actual law before ruling, and at the end you get "
        "scored. And the one thing an AI must never do to a law student -- "
        "invent a law -- it structurally cannot do here, because every "
        "provision it names is checked against a folder of 53 real provisions "
        "we copied out of the official statute books by hand.")

    s.append(h2("The three sentences underneath that"))
    s += numbered([
        "<b>It is not one AI playing dress-up.</b> Three separate agents act "
        "in sequence on a single question -- opposing counsel objects, the "
        "judge reads the statute and rules, and only then does the witness "
        "answer. That sequence is the thing a single chatbot cannot produce.",

        "<b>It cannot make up law.</b> Objections can only be raised on "
        "grounds backed by a provision that exists. Every sentence any agent "
        "speaks is checked against the statute folder before it reaches the "
        "student. Anything unverified is labelled on screen, not hidden.",

        "<b>Every claim has a number.</b> Retrieval, the judge, the "
        "objections, the witness and the security of the whole thing were all "
        "measured against fixed test sets, and the numbers are in this "
        "document.",
    ])

    s.append(h2("What to have open on screen"))
    s += bullets([
        "The live app, with a seeded criminal case ready to start.",
        "A microphone that works -- test it in the room, not at home.",
        "This document, at the numbers page.",
    ])

    s += note(
        "The demo is <b>live only</b>. There is no recorded fallback: if the "
        "venue has no network, or the API balance is exhausted, there is no "
        "demo. Check both an hour before you present, and have the numbers "
        "page ready to talk from if it fails.", "BEFORE YOU GO")
    return s


def part_problem():
    s = h1("Why this exists", "The problem, and why the obvious fix fails")

    s.append(h2("A law degree with almost no talking in it"))
    s.append(p(
        "Advocacy is a spoken skill. You learn it by standing up, being "
        "interrupted, being objected to, and being asked a question you did "
        "not prepare for. A moot court is how that is normally taught -- and "
        "a moot court needs four people, a room, and a shared free hour. In "
        "practice most Pakistani law students get a handful of them across "
        "the whole degree, and then meet their first real objection in front "
        "of a real judge."))

    s.append(h2("The obvious fix, and the trap in it"))
    s.append(p(
        "The obvious fix is to have an AI play the other roles. The trap is "
        "that AI systems invent law with total confidence. Ask any general "
        "chatbot about Pakistani evidence law and it will produce something "
        "like <i>\"under Section 429 of the Evidence Act...\"</i> -- correct "
        "in tone, correct in shape, and simply not real."))

    s.append(p(
        "For most subjects a confident wrong answer is an annoyance. For a "
        "law student it is a trained-in error. They will repeat it in an exam, "
        "and one day in a courtroom. <b>A tool that misquotes a statute to a "
        "law student is worse than no tool at all.</b>"))

    s += say(
        "So the whole project is built around one question: how do you let an "
        "AI argue law without letting it invent law?")

    s.append(h2("The answer, in one line"))
    s.append(p(
        "Do not let it speak from memory. Give it a folder of real law, make "
        "it look things up before it rules, and check every sentence it "
        "produces against that folder before a student ever hears it."))

    s.append(h2("Who it is for"))
    s += bullets([
        "<b>Law students</b> -- practice advocacy alone, at 2am, as often as "
        "they like.",
        "<b>Their teachers</b> -- a scored transcript of what the student "
        "actually said, rather than an impression.",
        "<b>Anyone building AI for a high-stakes profession</b> -- the "
        "honesty machinery here is the transferable part.",
    ])
    return s


def part_map():
    s = h1("The shape of it", "One question, start to finish")
    s.append(p(
        "This is the whole system on one page. Everything after this is the "
        "same journey slowed down.", LEAD))

    s += code("""
   YOU SPEAK
   "You saw him do it with your own eyes, didn't you?"
        |
        v
   [1] Your voice becomes text
        |
        v
   [2] A router asks: is a witness on the stand?   ---- no ---> judge or
        |                                                       opponent
       yes                                                      replies
        |
        v
   [3] OPPOSING COUNSEL listens and decides, on its own,
       whether to object.  It may only object on a ground
       backed by a real provision.
        |
        +---- stays silent ------------------------> witness answers
        |
       objects: "leading question, Article 137"
        |
        v
   [4] THE JUDGE does not rule from memory.  It looks up
       Art. 137 AND its neighbours 136 and 138, then rules.
        |
        +---- OVERRULED ---------------------------> witness answers
        |
       SUSTAINED
        |
        v
   [5] Question struck.  The witness never answers.
        |
        v
   [6] Every sentence spoken is checked against the 53
       provisions.  Anything not in there is flagged.
        |
        v
   [7] You HEAR it -- each speaker in a different voice.
        |
        v
   [8] The session is remembered, and scored at the end.
""")

    s += note(
        "The interesting part is step 3 to step 5. <b>Three different agents "
        "act on one question, in order, and the third one may never get to "
        "speak.</b> No single chatbot swapping voices can produce that -- it "
        "would have to decide the objection and the ruling in the same breath "
        "it wrote the answer.", "THE POINT")
    return s


def part_walkthrough_a():
    s = h1("The full flow, part one", "From signing in to being objected to")

    s += step(1, "You sign in and pick a case", [
        "Sessions are private to you -- your practice and your scores are not "
        "shared. You then either pick a case from the seeded library, or ask "
        "the system to write you a new one.",
        "A generated case is not free text. It comes back with parties, a set "
        "of facts, the grounds being argued, the relief asked for, and named "
        "witnesses with statements. <b>Every provision it cites is resolved "
        "against the statute folder before the case is saved</b> -- if the "
        "model invents a section, the case is rejected rather than stored.",
    ])

    s += step(2, "The hearing runs in five phases", [
        "Opening statement, examination of your own witness, "
        "cross-examination, closing argument, and then the verdict. The phase "
        "matters more than it sounds: the same question can be perfectly "
        "proper in cross-examination and objectionable in examination-in-"
        "chief. The system knows which phase you are in and judges you "
        "accordingly.",
    ])

    s += step(3, "You speak", [
        "You hold the button and talk, the way you would in a real courtroom. "
        "No typing. This matters for the pitch: <b>advocacy is a spoken "
        "skill, so the practice has to be spoken too.</b> A student typing "
        "arguments is doing a different exercise.",
    ])

    s += step(4, "Your voice becomes text", [
        "The recording is transcribed. This currently takes about 4.5 "
        "seconds and is the single biggest delay before you hear anything "
        "back -- an honest known weak point, and the next thing worth "
        "optimising.",
    ])

    s += step(5, "A router decides who should respond", [
        "This is a plain rule, not another AI decision, which makes it fast "
        "and predictable. Is there a witness on the stand? Then opposing "
        "counsel gets to screen the question first. Is this an opening or a "
        "closing? Then the bench responds. Cross-examination with nobody in "
        "the box? Then opposing counsel argues back.",
    ])

    s += step(6, "Opposing counsel decides whether to object", [
        "This is the agent that makes the room feel alive: <b>it objects "
        "without being asked.</b> After every question you put to a witness, "
        "it decides on its own whether the question was improper.",
        "It has seven grounds available, and each one is wired to a specific "
        "provision -- hearsay to Article 71, leading question to Article 137, "
        "improper use of a police statement to section 162, and so on. "
        "<b>It physically cannot object on a ground whose provision does not "
        "exist.</b>",
        "It is also instructed to stay quiet unless a ground clearly applies. "
        "An opponent who objects to everything is noise, not opposition.",
    ])
    return s


def part_walkthrough_b():
    s = h1("The full flow, part two", "The ruling, the answer, and the check")

    s += step(7, "The judge looks the law up before ruling", [
        "This is the part to slow down on, because it is the strongest thing "
        "in the project. <b>The judge does not rule from memory.</b> It runs a "
        "short loop: it states what it needs to check, searches the statute "
        "folder, reads what comes back, and only then rules.",
        "And it pulls the neighbouring provisions too. A leading-question "
        "objection under Article 137 is read alongside Article 136, which "
        "defines what a leading question is, and Article 138, which says "
        "leading is allowed in cross-examination. Without 138 in front of it, "
        "the judge would wrongly sustain leading questions during cross -- "
        "where leading is completely proper.",
        "Every step of that loop is recorded and shown. The ruling is not "
        "merely grounded; <b>it is shown to be grounded.</b> The loop is capped "
        "at three lookups so it cannot run away, and if it fails entirely it "
        "overrules -- the safer default, because overruling lets a possibly-"
        "proper question stand rather than wrongly striking it.",
    ])

    s += step(8, "The witness answers -- or does not", [
        "If the objection is <b>overruled</b>, the witness answers in "
        "character, consistent with their written statement and with "
        "everything they have already said.",
        "If it is <b>sustained</b>, the question is struck and the witness "
        "never answers at all. That silence is the correct behaviour and it "
        "is worth pointing at during the demo -- it is the clearest proof "
        "that three agents really did act in sequence.",
    ])

    s += step(9, "Every sentence is checked against the statute folder", [
        "Before anything reaches you, every provision mentioned in it is "
        "looked up in the folder of 53. If an agent names something that is "
        "not there, it is flagged rather than passed on as law.",
        "There is a subtlety worth knowing in case you are asked. The raw "
        "check cannot tell the difference between an agent <i>relying</i> on a "
        "fake provision and an agent <i>correctly rejecting</i> one the "
        "student just invented. So what a student sees is the attributed "
        "version -- the bench does not get marked wrong for catching your "
        "mistake.",
    ])

    s += step(10, "You hear it, in different voices", [
        "Each speaker is spoken aloud in a distinct voice, and the audio "
        "starts streaming as each agent finishes rather than waiting for the "
        "whole turn. That change took first audio from 16.1 seconds down to "
        "<b>8.1 seconds</b>, with opposing counsel audible at 6.9.",
    ])

    s += step(11, "It remembers what you said", [
        "The agents keep two kinds of memory: the current phase word for "
        "word, and a running summary of everything before it -- your claims, "
        "the testimony given, the directions from the bench.",
        "That is what lets opposing counsel catch you <b>changing your story "
        "between phases</b>, which is exactly what a real opponent does. The "
        "summary is only rebuilt when you move phase, not every turn, which "
        "keeps it to about four extra model calls for a whole session.",
    ])

    s += step(12, "You get scored", [
        "At the end, a scorecard on four counts: legal reasoning, "
        "persuasiveness, procedure, and command of the facts -- plus who won "
        "and why.",
        "<b>The legal-reasoning score is anchored to the citation check.</b> "
        "It is not the model's impression of whether you sounded legal. If "
        "you cited law that does not exist, that shows up in the score as "
        "fact.",
    ])
    return s


def part_retrieval():
    s = h1("Under the bonnet", "How it finds the right law")
    s.append(p(
        "Someone speaks, and the system has to find the right provision out "
        "of 53 -- fast. There are two ways to search, and each one fails "
        "exactly where the other works.", LEAD))

    s += table(
        ["Way of searching", "Brilliant at", "Useless at"],
        [
            ["<b>Match the words</b><br/>Look for provisions containing the "
             "same words as the question.",
             '<i>"section 302"</i> -> finds section 302 exactly.',
             '<i>"he is just repeating what someone told him"</i>. The right '
             'provision says <i>"oral evidence must be direct"</i>. Words in '
             'common: <b>zero</b>.'],
            ["<b>Match the meaning</b><br/>Turn every provision into a list "
             "of numbers capturing what it means, and compare.",
             '<i>"he is just repeating what someone told him"</i> -> finds '
             'Article 71, despite no shared words.',
             '<i>"section 302"</i> -> returns a <i>neighbourhood</i> of '
             'murder-ish provisions. But the person wanted 302, not a '
             'neighbourhood.'],
        ],
        [30, 34, 36],
        "Lawyers search both ways constantly -- sometimes citing a number, "
        "sometimes describing a situation. So the system runs both.")

    s.append(h2("Merging the two answers"))
    s.append(p(
        "Running both leaves two ranked lists that have to be combined, and "
        "their scores are not comparable -- word-match scores swing from 7 to "
        "40 depending on the question, while meaning-scores are squeezed into "
        "a narrow band around 0.3 to 0.45. Add them and the word score always "
        "wins."))
    s.append(p(
        "<b>So the scores are thrown away and only the positions are kept.</b> "
        "Something ranked first on one list and third on the other beats "
        "something ranked second and ninth. Nothing to tune, and nothing "
        "breaks when the folder changes."))

    s.append(h2("Then something that knows law reads the shortlist"))
    s.append(p(
        "Merging gives a shortlist of about fifteen. Good, but not right. On "
        "the hearsay question above, merging put the correct provision "
        "<b>second</b> -- beaten by Article 151, on impeaching a witness's "
        "credit. So a language model reads the shortlist and scores each one "
        "for legal fitness. It moved the right answer to first, ten out of "
        "ten."))
    s.append(p(
        "<b>And it did something neither search could.</b> It reached down to "
        "nineteenth place and pulled up Article 46 -- the dying declaration, "
        "which is the <i>exception</i> to the hearsay rule. Article 46 shares "
        "no words with the question and does not mean the same thing. It is "
        "connected by legal doctrine: you cannot rule on hearsay without "
        "knowing its exception. No amount of word-matching or meaning-"
        "matching finds that."))

    # A deliberate break: without it the closing quote and the two practical
    # details trail alone onto a near-empty page. Splitting at this heading
    # leaves both pages substantial.
    s.append(PageBreak())
    s.append(h2("The bit that makes this defensible: the standard tool lost"))
    s += table(
        ["Approach to re-ranking", "Where the correct provision ended up"],
        [
            ["Merged lists, no re-ranking", "2nd"],
            ["The standard off-the-shelf re-ranker (<i>ms-marco-MiniLM</i>)",
             "<b>10th out of 15</b> -- worse than doing nothing"],
            ["A language model", "<b>1st</b>, scored 10/10"],
        ],
        [58, 42])
    s.append(p(
        "The off-the-shelf tool was trained on web-search data. Nothing in "
        "Bing searches connects <i>\"repeating what someone told him\"</i> to "
        "<i>\"oral evidence must, in all cases whatever, be direct\"</i>. "
        "Every score it returned was negative -- the model honestly reporting "
        "it had never seen anything like this corpus."))

    s += say(
        "We did not choose the language model because it sounded better. We "
        "benchmarked the standard tool, measured it, found it was worse than "
        "no re-ranking at all, and have the number.")

    s.append(h2("Two practical details"))
    s += bullets([
        "<b>Re-ranking is switched off during live speech.</b> It costs about "
        "8 seconds against 0.9. In a spoken turn, speed is the product -- so "
        "it runs where correctness matters instead: rulings, verdicts, and "
        "case generation.",
        "<b>If it breaks, nothing breaks.</b> The re-ranker failing falls "
        "back to the merged order. It degrades the ranking; it never fails "
        "the request.",
    ])
    return s


def part_honesty():
    s = h1("The thing to lead with", "Why it cannot make up law")
    s.append(p(
        "If the panel remembers one thing, make it this. Every other team can "
        "claim their AI is accurate. This one can show the machinery.", LEAD))

    s.append(h2("First: a folder of real law, typed in by hand"))
    s.append(p(
        "53 provisions, copied out of the official Pakistani statute books: "
        "20 articles of evidence law, 15 sections of the Penal Code, 10 "
        "sections of criminal procedure, and 8 constitutional articles."))
    s += note(
        "<b>52 of the 53 have been compared word for word against the "
        "official printed source.</b> The one exception is Constitution "
        "Article 199, whose text in the folder is <i>newer</i> than the "
        "official print available -- so rather than assume it is right, it "
        "carries an unverified flag and shows a warning on screen. "
        "<b>That single exception is the most persuasive thing in the "
        "project</b>: it proves the checking is real and not a claim.",
        "USE THIS")

    s.append(h2("Second: agents can only cite what exists"))
    s.append(p(
        "Objections are not free text. Each of the seven grounds is bound in "
        "code to a specific provision, and the ground is only offered if that "
        "provision is in the folder. So <b>every objection is citable by "
        "construction</b> -- not because the model was asked nicely."))

    s.append(h2("Third: everything is checked before it is spoken"))
    s.append(p(
        "Every sentence from every agent, and every claim the student makes, "
        "is scanned for provisions and checked against the folder. Anything "
        "not there is flagged. The same check runs over a generated case "
        "before it is saved, so an invented section stops the case being "
        "stored at all."))

    s.append(h2("Fourth: what is not verified says so, loudly"))
    s.append(p(
        "Unverified text carries a visible warning marker in the interface "
        "and in the text handed to the agents. There is no setting to turn "
        "that off, and no way to shorten it to make the output look tidier. "
        "<b>The warnings are a feature to point at, not an obstacle to hide.</b>"))

    s.append(h2("And it was attacked on purpose"))
    s.append(p(
        "36 prompt-injection attacks were written -- attempts to talk the "
        "courtroom into ignoring its instructions -- and run through the full "
        "system. <b>None landed.</b> The reason is almost funny: when you try "
        "to smuggle instructions into your argument, opposing counsel objects "
        "to them as irrelevant, because that is what they are."))
    s += note(
        "There is deliberately <b>no separate injection filter</b>. The "
        "position taken is that a guard should be built when an attack lands, "
        "and that the attack should be added to the test set first. Saying "
        "that out loud is stronger than claiming a filter nobody tested.",
        "IF ASKED")
    return s


def part_numbers():
    s = h1("The scoreboard", "Every claim with a number attached")
    s.append(p(
        "This is the page to have open. Nothing here is an estimate -- each "
        "row comes from a test set that can be re-run.", LEAD))

    s.append(h2("Finding the right law"))
    s += table(
        ["What was measured", "Result", "How"],
        [
            ["Correct provision ranked first, merging only", "80%",
             "20 fixed questions"],
            ["Correct provision ranked first, with re-ranking", "<b>100%</b>",
             "same 20 questions"],
            ["Provisions checked word-for-word against official print",
             "<b>52 of 53</b>", "one flagged unverified, on purpose"],
        ],
        [46, 20, 34],
        "The 80 to 100 gap is the important part: it shows the re-ranker is "
        "doing real work, rather than the task being too easy to get wrong.")

    s.append(h2("The courtroom"))
    s += table(
        ["What was measured", "Result"],
        [
            ["Improper questions correctly objected to", "<b>100%</b> caught"],
            ["Objection precision, F1 and correct ground",
             "0.98 - 0.99 average over 3 runs"],
            ["Sustained objections that leaked an answer anyway",
             "<b>0</b> -- the witness never speaks through a sustained "
             "objection"],
            ["Witness inventing facts it could not know",
             "<b>0 out of 9</b> attempts"],
            ["Witness outcomes correct", "17 of 17"],
            ["Prompt-injection attacks that worked", "<b>0 out of 36</b>"],
        ],
        [58, 42])

    s.append(h2("The judge marking students"))
    s.append(p(
        "Three prepared transcripts -- one strong, one mixed, one weak -- were "
        "put through the scorer to see whether it can actually tell them "
        "apart."))
    s += table(
        ["Transcript", "Score", "Citation accuracy"],
        [
            ["Strong advocacy", "85 - 88", "100%"],
            ["Mixed", "55 - 58", "--"],
            ["Weak, citing invented law", "25 - 35", "<b>0%</b>"],
        ],
        [40, 30, 30],
        "The order is what matters -- it separates good advocacy from bad, "
        "and it does not reward confident nonsense.")

    s.append(h2("Speed and cost"))
    s += table(
        ["What", "Measured"],
        [
            ["First audio back after you stop speaking",
             "<b>8.1 seconds</b> (was 16.1 before streaming)"],
            ["Opposing counsel audible at", "6.9 seconds"],
            ["Of which, turning your speech into text",
             "4.5 seconds -- the biggest remaining delay"],
            ["Cost of an average courtroom turn", "<b>$0.0103</b>"],
            ["A turn with no objection", "$0.0020"],
            ["A turn with an objection and a full ruling", "$0.0168"],
        ],
        [52, 48])

    s += note(
        "Costs are metered per model call inside the system, not estimated. "
        "The figures above are the shipped configuration -- the one where the "
        "judge states its reasoning before each lookup. Making that reasoning "
        "visible costs about <b>1.5 hundredths of a cent per objection</b>, "
        "and the earlier figures of $0.0095 and $0.0153 you may see quoted "
        "elsewhere in the repository are the same system with that visibility "
        "switched off.", "ON COST")

    s += say(
        "A full practice session costs a couple of cents. The reason we can "
        "tell you that to four decimal places is that every model call in the "
        "system is metered, not sampled.")
    return s


def part_questions():
    s = h1("They will ask", "Questions, and how to answer them")

    s += qa(
        "Why only 53 provisions? That is a tiny amount of law.",
        "<b>53 is not a decision, it is a total.</b> We chose the law a "
        "criminal trial with a witness box actually needs -- the objection "
        "rules, the offences, the procedure, and the fair-trial rights -- and "
        "it came to 53. 45 of those 53 are criminal and evidence provisions, "
        "which is the corpus matching the one thing the app does. "
        "<br/><br/>And it is capped on purpose: every provision was checked "
        "by hand against the official print. You can do that for 53. You "
        "cannot for 3,000. We chose a small library we can prove is correct "
        "over a large one we would only be hoping about.")

    s += qa(
        "Is it not just ChatGPT with a legal prompt?",
        "No, and the clearest proof is the sustained objection. Three "
        "separate agents act in sequence on one question: opposing counsel "
        "decides to object, the judge looks up the statute and rules, and the "
        "witness -- who was about to answer -- never speaks. A single model "
        "swapping voices would have to decide the objection, the ruling and "
        "the answer in one breath. It cannot produce a genuine silence.")

    s += qa(
        "How do you know it is not making up law?",
        "Three layers. Objections can only be raised on grounds bound in code "
        "to a provision that exists. Every sentence produced is checked "
        "against the folder before it reaches the student. And 52 of the 53 "
        "provisions were diffed word for word against the official print -- "
        "with the 53rd deliberately flagged unverified because its text is "
        "newer than the print we could get.")

    s += qa(
        "Why not use a proper vector database?",
        "At this size an exact search is both faster and more accurate than "
        "an approximate index, and it removes a database extension from the "
        "deployment. The approach stays right up to a few thousand "
        "provisions. <b>Careful here:</b> the small corpus is not the reason "
        "-- the search is sized for thousands. Do not let those two arguments "
        "get merged.")

    s += qa(
        "Your retrieval scores 100%. Is that not suspiciously perfect?",
        "It is perfect on 20 questions over 53 provisions, and we say so "
        "before anyone asks. The number that carries the argument is not the "
        "100 -- it is the <b>80 without re-ranking</b>. The gap is what proves "
        "the component earns its place.")

    s += qa(
        "What happens if the AI gets a ruling wrong?",
        "It shows its working. Every lookup the judge made is recorded and "
        "displayed, so a student or a teacher can see exactly which "
        "provisions the ruling was based on and disagree with it. The "
        "alternative -- a confident ruling with no visible reasoning -- is "
        "what we were trying to avoid.")

    s += qa(
        "What is not finished?",
        "Answer this one straight -- see the next page. Transcription is "
        "slow at 4.5 seconds. One older piece of reasoning still sits in the "
        "wrong service. There is no automated deployment or continuous "
        "testing yet. And the demo is live-only, with no offline fallback.")
    return s


def part_limits():
    s = h1("Say this before they find it", "The honest limits")
    s.append(p(
        "A pitch that volunteers its own weak points is believed on "
        "everything else. Every item here is already written down in the "
        "repository -- none of it is a surprise you are hiding.", LEAD))

    s.append(h2("What is genuinely not done"))
    s += bullets([
        "<b>Transcription takes 4.5 seconds</b> and is the largest single "
        "delay before you hear anything. It uses an older speech model that "
        "has not been swapped yet.",
        "<b>One piece of reasoning is in the wrong place.</b> When a student "
        "raises an objection manually, the ruling is still produced in the "
        "web layer instead of the reasoning service. It works; it is "
        "architecturally in the wrong service and is on the list.",
        "<b>No automated deployment or continuous testing.</b> Cost and speed "
        "are metered and every evaluation run is recorded, but there is no "
        "container, no pipeline, and no per-call tracing yet.",
        "<b>Cost is visible in the test harness, not in the app.</b> A "
        "student cannot yet see what their own session cost.",
        "<b>One provision is unverified</b> -- Constitution Article 199 -- "
        "and is flagged rather than quietly trusted.",
    ])

    s.append(h2("What has been heard working, and what has not"))
    s.append(p(
        "Be precise about this if voice comes up. Speaking into the "
        "microphone, an objection being raised and the bench ruling on it "
        "have all been <b>heard out loud</b>, in distinct voices. What nobody "
        "has yet listened to is a <b>witness answering</b> -- because the run "
        "that was tested ended in a sustained objection, where silence is the "
        "correct behaviour. The path is built and tested in code; it has not "
        "been heard."))

    s += note(
        "If the live demo produces a witness answer tomorrow, that is the "
        "last unheard link closing in front of the panel. If it produces a "
        "sustained objection instead, <b>the silence is the feature</b> -- "
        "say so, and point at it.", "EITHER WAY")

    s.append(h2("What is deliberately not built"))
    s.append(p(
        "There is no prompt-injection filter, and that is a decision rather "
        "than a gap. 36 attacks were run through the full system and none "
        "landed, because opposing counsel objects to smuggled instructions as "
        "irrelevant. The position is that the guard gets built when an attack "
        "gets through -- and the attack goes into the test set first."))

    s.append(h2("And the one to have a plan for"))
    s.append(p(
        "<b>The demo is live-only.</b> The recorded fallback was removed as "
        "outside the minimum product. No network at the venue, or an "
        "exhausted API balance, means no demo. Check both before you present, "
        "and if it fails, present from the scoreboard page -- every number "
        "there stands on its own."))

    s += say(
        "None of that is hidden in the repository -- the pending list is the "
        "first thing an engineer reads when they open the project. We would "
        "rather show you the list than have you find it.")
    return s


def build_story():
    story = part_cover()
    story += part_sixty_seconds()
    story += part_problem()
    story += part_map()
    story += part_walkthrough_a()
    story += part_walkthrough_b()
    story += part_retrieval()
    story += part_honesty()
    story += part_numbers()
    story += part_questions()
    story += part_limits()
    return story


def main() -> None:
    out = Path(__file__).resolve().parents[1] / "docs"
    out.mkdir(exist_ok=True)
    target = out / "CourtSimulator_Pitch_Brief.pdf"

    doc = SimpleDocTemplate(
        str(target),
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN + 6,
        title="CourtSimulator - Pitch Brief",
        author="CourtSimulator",
        subject="The full flow in plain English, for presenting",
    )
    doc.build(build_story(), canvasmaker=NumberedCanvas)
    print("Wrote %s" % target)
    print("Questions in the bank: %d" % _QA["n"])


if __name__ == "__main__":
    main()
