"""Builds the plain-English Adalat AI explainer PDF."""

import os
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "docs", "adalat-ai-explained.pdf")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

# The app's own palette, so the document and the product read as one thing.
INK = colors.HexColor("#1A1F27")
VIOLET = colors.HexColor("#4C2F78")
VERMILION = colors.HexColor("#C03D24")
SEAL = colors.HexColor("#255B48")
PAPER = colors.HexColor("#EDEFE8")
RULE = colors.HexColor("#C6C9BE")
MUTED = colors.HexColor("#5C666F")

styles = getSampleStyleSheet()


def style(name, **kw):
    base = kw.pop("parent", styles["Normal"])
    return ParagraphStyle(name, parent=base, **kw)


S = {
    "title": style(
        "t", fontName="Times-Bold", fontSize=27, leading=31, textColor=INK,
        spaceAfter=6,
    ),
    "subtitle": style(
        "st", fontName="Helvetica", fontSize=11.5, leading=16, textColor=MUTED,
        spaceAfter=20,
    ),
    "part": style(
        "p", fontName="Times-Bold", fontSize=19, leading=23, textColor=VIOLET,
        spaceBefore=20, spaceAfter=9,
    ),
    "h": style(
        "h", fontName="Helvetica-Bold", fontSize=12, leading=16, textColor=INK,
        spaceBefore=14, spaceAfter=5,
    ),
    "body": style(
        "b", fontName="Helvetica", fontSize=10, leading=15.5, textColor=INK,
        spaceAfter=8, alignment=TA_LEFT,
    ),
    "bullet": style(
        "bu", fontName="Helvetica", fontSize=10, leading=15, textColor=INK,
        leftIndent=13, bulletIndent=3, spaceAfter=4,
    ),
    "eyebrow": style(
        "e", fontName="Courier-Bold", fontSize=7.6, leading=11, textColor=MUTED,
        spaceAfter=3,
    ),
    "boxhead": style(
        "bh", fontName="Courier-Bold", fontSize=7.6, leading=11,
        textColor=VIOLET, spaceAfter=4,
    ),
    "boxbody": style(
        "bb", fontName="Helvetica", fontSize=9.3, leading=14, textColor=INK,
    ),
    "mono": style(
        "m", fontName="Courier", fontSize=8.2, leading=11.6, textColor=INK,
    ),
    "cell": style("c", fontName="Helvetica", fontSize=8.8, leading=12.5,
                  textColor=INK),
    "cellb": style("cb", fontName="Helvetica-Bold", fontSize=8.8, leading=12.5,
                   textColor=INK),
    "foot": style("f", fontName="Helvetica", fontSize=8, leading=11,
                  textColor=MUTED),
}

story = []


def P(text, s="body"):
    story.append(Paragraph(text, S[s]))


def H(text):
    story.append(Paragraph(text, S["h"]))


def PART(number, text):
    story.append(Paragraph(f"Part {number}", S["eyebrow"]))
    story.append(Paragraph(text, S["part"]))


def BULLETS(items):
    for item in items:
        story.append(Paragraph(item, S["bullet"], bulletText="\u2022"))
    story.append(Spacer(1, 5))


def GAP(h=7):
    story.append(Spacer(1, h))


def BOX(head, lines, accent=VIOLET, bg=PAPER):
    """A callout: a legal term explained, or a key idea."""
    inner = [Paragraph(head, ParagraphStyle(
        "bh2", parent=S["boxhead"], textColor=accent))]
    for line in lines:
        inner.append(Paragraph(line, S["boxbody"]))
        inner.append(Spacer(1, 3))
    table = Table([[inner]], colWidths=[163 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LINEBEFORE", (0, 0), (0, -1), 2, accent),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(KeepTogether(table))
    GAP(10)


def CODE(lines):
    body = [[Paragraph(line.replace(" ", "&nbsp;"), S["mono"])] for line in lines]
    table = Table(body, colWidths=[163 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F4F5F0")),
        ("BOX", (0, 0), (-1, -1), 0.5, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))
    story.append(KeepTogether(table))
    GAP(10)


def TABLE(rows, widths, head=True):
    data = []
    for r_i, row in enumerate(rows):
        data.append([
            Paragraph(str(cell), S["cellb"] if (head and r_i == 0) else S["cell"])
            for cell in row
        ])
    table = Table(data, colWidths=widths, repeatRows=1 if head else 0)
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE),
    ]
    if head:
        commands += [
            ("BACKGROUND", (0, 0), (-1, 0), PAPER),
            ("LINEBELOW", (0, 0), (-1, 0), 0.9, INK),
        ]
    table.setStyle(TableStyle(commands))
    story.append(table)
    GAP(11)


# ===========================================================================
# Cover
# ===========================================================================

GAP(30)
P("A plain-English guide", "eyebrow")
P("Adalat AI: How It Works", "title")
P(
    "A voice-first moot-court simulator for Pakistani law students. "
    "This guide explains the whole system from the beginning, and assumes "
    "you know nothing about law and nothing about the code. Every legal "
    "term is explained the first time it appears.",
    "subtitle",
)

BOX(
    "WHAT THIS DOCUMENT COVERS",
    [
        "<b>Parts 1 and 2</b> explain the problem and teach you the courtroom "
        "words you need. No technology.",
        "<b>Parts 3 to 9</b> explain how the software works, one piece at a time.",
        "<b>Parts 10 to 12</b> cover honesty, measurement, and what is still "
        "unfinished.",
    ],
)

PART(1, "What problem this solves")

P(
    "Law students have to learn how to argue a case out loud, standing up, "
    "in front of a judge who interrupts them. Reading about it is not enough. "
    "You have to practise it."
)
P(
    "The traditional way to practise is a <b>moot court</b>. A moot court is a "
    "pretend trial. Students argue a made-up case in front of a pretend judge. "
    "It is the legal equivalent of a flight simulator."
)
P(
    "The problem is people. A moot court needs someone to play the judge, "
    "someone to play the lawyer on the other side, and someone to play each "
    "witness. Getting four or five people into a room at the same time is "
    "difficult, so most students practise far less than they should."
)
P(
    "<b>Adalat AI replaces those people with AI.</b> The student speaks out "
    "loud into a microphone. An AI judge, an AI opposing lawyer, and AI "
    "witnesses answer out loud, each in a different voice. At the end, the "
    "student is given marks and written feedback."
)
P(
    "The name comes from Urdu: <i>adalat</i> means <b>court</b>."
)

BOX(
    "THE ONE THING THAT MAKES THIS HARD",
    [
        "A tool that confidently tells a law student the wrong law is worse "
        "than no tool at all. A student may repeat it in a real courtroom.",
        "So a large part of this project is not about making the AI sound "
        "clever. It is about making the AI provably honest: only citing laws "
        "that actually exist, and clearly labelling anything that has not been "
        "checked yet. Part 10 covers this.",
    ],
    accent=VERMILION,
)

story.append(PageBreak())

# ===========================================================================
PART(2, "A crash course in the courtroom")

P(
    "None of the software makes sense until these words do. Read this part "
    "even if you skip everything else."
)

H("The people in the room")

TABLE(
    [
        ["Word", "What it means"],
        ["<b>The Bench</b>", "A formal way of saying <i>the judge</i>. The AI "
         "plays this role."],
        ["<b>Counsel</b>", "A lawyer arguing a case. <b>You are counsel.</b> "
         "\"Learned counsel\" is the polite way lawyers address each other."],
        ["<b>Opposing counsel</b>", "The lawyer on the other side, whose job "
         "is to argue against you. The AI plays this role."],
        ["<b>Witness</b>", "A person who saw or knows something, and answers "
         "questions about it under oath. The AI plays these."],
        ["<b>Petitioner</b>", "The side that brought the case to court."],
        ["<b>Respondent</b>", "The side defending against the case."],
    ],
    widths=[38 * mm, 125 * mm],
)

H("The five phases of a session")

P(
    "A trial runs in a fixed order. This app models five stages, and you move "
    "through them one at a time:"
)

TABLE(
    [
        ["#", "Phase", "What happens"],
        ["01", "<b>Opening</b>", "Each side tells the court, in summary, what "
         "the case is about and what they want."],
        ["02", "<b>Examination-in-chief</b>", "You question <b>your own</b> "
         "witness. Also called \"direct examination\"."],
        ["03", "<b>Cross-examination</b>", "You question <b>the other side's</b> "
         "witness, to weaken their evidence."],
        ["04", "<b>Closing</b>", "Each side sums up the whole case and asks "
         "for a decision."],
        ["05", "<b>Verdict</b>", "The judge decides. In this app, the judge "
         "also marks the student."],
    ],
    widths=[10 * mm, 45 * mm, 108 * mm],
)

H("The most important rule in the whole app")

P(
    "The difference between phase 02 and phase 03 is the single legal idea "
    "the software is built around, so it is worth understanding properly."
)
P(
    "When you question <b>your own</b> witness, you are <b>not allowed</b> to "
    "ask a <b>leading question</b>. A leading question is one that already "
    "contains the answer inside it."
)

BOX(
    "LEADING QUESTION - THE TEST",
    [
        "<b>Leading:</b> \"You saw him forge the document, didn't you?\"<br/>"
        "You have put the answer into the witness's mouth. All they have to "
        "do is agree.",
        "<b>Not leading:</b> \"What did you see that evening?\"<br/>"
        "The answer is entirely up to the witness.",
        "<b>The simple test:</b> a question is leading if it states a fact and "
        "invites agreement, especially with a tag like \"didn't you?\", "
        "\"isn't it?\", or \"correct?\". Questions that begin with "
        "<b>what, where, when, who, why, how</b> or \"describe\" are almost "
        "never leading, no matter how important the subject is.",
    ],
)

P(
    "<b>Why does this rule exist?</b> Your own witness is on your side. If you "
    "were allowed to feed them answers, their evidence would really just be "
    "your words coming out of their mouth, and it would be worth nothing. So "
    "the law forces you to ask open questions and let the witness speak."
)
P(
    "In <b>cross-examination</b> the rule flips. There, leading questions "
    "<b>are</b> allowed, because you are questioning a witness who is not on "
    "your side and will not volunteer anything helpful. You are permitted to "
    "put propositions to them directly."
)

H("Objections")

P(
    "When one lawyer asks an improper question, the other lawyer stands up "
    "and interrupts. This is an <b>objection</b>. The lawyer says "
    "\"Objection, My Lord\" and then gives a <b>ground</b>, which is the "
    "specific reason the question is improper."
)
P("The judge then does one of two things:")

BULLETS([
    "<b>Sustains</b> the objection: \"You are right, that question is "
    "improper.\" The witness <b>does not answer</b>. The question is struck.",
    "<b>Overrules</b> the objection: \"No, the question is fine.\" The witness "
    "answers normally.",
])

P("The common grounds for an objection:")

TABLE(
    [
        ["Ground", "Plain meaning"],
        ["<b>Leading question</b>", "The question contains its own answer "
         "(explained above)."],
        ["<b>Hearsay</b>", "The witness is repeating what somebody else told "
         "them, rather than what they saw themselves. Not allowed, because "
         "the person who actually said it is not in court to be questioned "
         "about it."],
        ["<b>Irrelevant</b>", "The question has nothing to do with the issues "
         "in the case."],
        ["<b>Argumentative or insulting</b>", "You are attacking or badgering "
         "the witness rather than actually asking them anything."],
        ["<b>Assumes unproved facts</b>", "The question treats something as "
         "already established when it has not been proved."],
    ],
    widths=[42 * mm, 121 * mm],
)

H("The actual Pakistani laws involved")

P(
    "Rules of evidence in Pakistan come from a statute called the "
    "<b>Qanun-e-Shahadat Order 1984</b>, usually shortened to <b>QSO</b>. "
    "\"Qanun-e-Shahadat\" simply means \"law of evidence\". It is divided into "
    "numbered <b>Articles</b>. Three of them carry most of the weight here:"
)

TABLE(
    [
        ["Provision", "What it says"],
        ["<b>QSO Article 136</b>", "Defines what a leading question is."],
        ["<b>QSO Article 137</b>", "You may not ask leading questions when "
         "examining your own witness - with some exceptions for "
         "introductory or undisputed matters."],
        ["<b>QSO Article 138</b>", "You may ask leading questions in "
         "cross-examination."],
        ["<b>QSO Article 71</b>", "Oral evidence must be direct. This is the "
         "article that makes hearsay objectionable."],
    ],
    widths=[42 * mm, 121 * mm],
)

P(
    "Three other statutes are also in the system: the <b>Pakistan Penal Code "
    "1860</b> (PPC - which acts are crimes), the <b>Criminal Procedure Code "
    "1898</b> (CrPC - how a criminal case is run), and the <b>Constitution of "
    "Pakistan 1973</b> (fundamental rights)."
)

BOX(
    "WHY ARTICLE 137 NEEDS ITS NEIGHBOURS",
    [
        "Article 137 says you cannot lead your own witness - but it has "
        "exceptions attached, and the definition of \"leading\" is in a "
        "different article (136), while the permission to lead in "
        "cross-examination is in another (138).",
        "So you cannot correctly decide a leading-question objection by "
        "reading Article 137 alone. You have to read 136, 137 and 138 "
        "together. <b>Remember this - it is exactly why the AI judge in this "
        "app was built to look up neighbouring provisions before it rules "
        "(Part 6).</b>",
    ],
)

story.append(PageBreak())

# ===========================================================================
PART(3, "How the software is put together")

P(
    "The system is three separate programs that talk to each other, plus one "
    "database. They are separated on purpose, not by accident."
)

CODE([
    "",
    "   YOUR BROWSER  (the website you see)",
    "        |",
    "        |  can only talk to its own server. Never talks to",
    "        |  the AI directly. Never holds the OpenAI password.",
    "        v",
    "   THE API SERVER  (Node.js / Express)",
    "        |",
    "        |  handles: saving to the database, turning your speech",
    "        |  into text, turning the AI's text back into speech.",
    "        |  Contains NO AI thinking of its own.",
    "        v",
    "   THE AI SERVICE  (Python)",
    "        |",
    "        |  ALL the thinking happens here: finding the law,",
    "        |  the judge, opposing counsel, the witnesses, marking.",
    "        v",
    "   POSTGRESQL DATABASE",
    "",
])

H("Why split it up like this?")

P(
    "Because it makes one question easy to answer: <b>\"where does this system "
    "make a decision?\"</b> The answer is one folder. All the AI reasoning is "
    "in the Python service and nowhere else."
)
P(
    "If AI logic were allowed to leak into the API server too, then over time "
    "nobody would be able to say with confidence what the system does or why. "
    "Keeping them apart, with a network call in between, makes that leak "
    "physically inconvenient - which is the point."
)
P(
    "There is a second safety benefit. The browser can only talk to its own "
    "server, so the OpenAI key never travels to a user's computer. A person "
    "using the site cannot steal it, because it was never sent to them."
)

story.append(PageBreak())

# ===========================================================================
PART(4, "How the AI finds the right law")

P(
    "Before any AI agent can say anything about the law, it has to find the "
    "law. This is the part of the project called <b>RAG</b>, which stands for "
    "<i>Retrieval-Augmented Generation</i>."
)

BOX(
    "RAG IN ONE SENTENCE",
    [
        "Instead of asking the AI to recall the law from memory (where it "
        "will confidently invent things), you first <b>search a real "
        "database of law</b>, then hand the AI the actual text you found and "
        "say \"answer using only this\".",
    ],
)

P(
    "The database holds <b>53 provisions</b> - individual sections and "
    "articles from the four statutes listed in Part 2."
)

H("Two different ways of searching, because there are two kinds of question")

P(
    "People search for law in two completely different ways, and no single "
    "search method handles both."
)

TABLE(
    [
        ["Kind of search", "Example", "What actually finds it"],
        ["<b>Word matching</b>", "\"section 302\", \"qatl-i-amd\"",
         "<b>BM25</b> - a classic keyword search. It matches the exact words. "
         "Very good at exact references."],
        ["<b>Meaning matching</b>",
         "\"the witness is just repeating what someone else told him\"",
         "<b>Vector search</b> - it converts the sentence into a list of "
         "numbers representing its meaning, and finds law with a similar "
         "meaning. This finds QSO Article 71 even though the two share almost "
         "no words."],
    ],
    widths=[33 * mm, 52 * mm, 78 * mm],
)

P(
    "So the app runs <b>both searches at once</b> and combines the results. "
    "The combining method is called <b>Reciprocal Rank Fusion</b>, and it "
    "works on the <i>positions</i> the two searches gave (1st, 2nd, 3rd...) "
    "rather than their raw scores."
)
P(
    "That detail matters. The two searches produce scores on completely "
    "different scales - keyword scores have no upper limit, while meaning "
    "scores are always squeezed between 0 and 1. Adding those numbers "
    "together directly would let the keyword search overwhelm the other one "
    "for no good reason. Comparing positions avoids this entirely."
)

H("Then a second AI re-reads the shortlist")

P(
    "After combining, an AI model reads the top results and re-orders them by "
    "which one actually governs the question. This is called <b>reranking</b>."
)

BOX(
    "A RESULT WORTH QUOTING IN YOUR DEFENCE",
    [
        "The obvious choice would have been a small, fast, free, "
        "purpose-built reranking model. It was tested against this corpus and "
        "it made the results <b>worse</b>.",
        "On the query <i>\"the witness is just repeating what somebody else "
        "told him outside court\"</i>, the correct answer (QSO Article 71) "
        "was ranked:",
        "&nbsp;&nbsp;&nbsp;combined search alone .......... <b>2nd</b><br/>"
        "&nbsp;&nbsp;&nbsp;AI reranker ................... <b>1st</b><br/>"
        "&nbsp;&nbsp;&nbsp;the small free model .......... <b>10th</b>",
        "<b>Why?</b> That small model was trained on web-search results. It "
        "rewards shared words and general topic overlap. Nothing in its "
        "training connects an everyday description of hearsay to the article "
        "that codifies it. A specialist model trained on the wrong subject is "
        "worse than no specialist at all.",
        "<b>Overall effect of reranking:</b> the correct provision was ranked "
        "first 90% of the time before, and <b>100% of the time</b> after.",
    ],
    accent=SEAL,
)

BOX(
    "WHY THERE IS NO VECTOR DATABASE",
    [
        "The usual advice is to store meaning-vectors in a specialised "
        "database with a clever index. This project does not, for a good "
        "reason: with only <b>53</b> provisions, simply comparing the "
        "question against every single one is <b>faster</b> than any clever "
        "index, and it is <b>exact</b> rather than approximate.",
        "Those clever indexes exist to approximate an answer when you have "
        "millions of records and cannot check them all. At 53 records, you "
        "can just check them all.",
    ],
)

story.append(PageBreak())

# ===========================================================================
PART(5, "How the courtroom runs: agents in a graph")

P(
    "This is the heart of the project. The courtroom is not one AI pretending "
    "to be several people. It is <b>several separate AI agents</b>, each with "
    "its own instructions, arranged in a flowchart."
)
P(
    "Each agent is a box in the flowchart. The arrows between them are "
    "decisions. When you finish speaking, your words enter at the top and "
    "travel down whichever path the situation requires."
)

CODE([
    "",
    "                        YOU SPEAK",
    "                            |",
    "              is a witness on the stand?",
    "                  |                    |",
    "                 YES                   NO",
    "                  |                    |",
    "                  v                    |",
    "        +---------------------+        |",
    "        |  OPPOSING COUNSEL   |        |",
    "        |  decides whether to |        |",
    "        |  object             |        |",
    "        +----------+----------+        |",
    "                   |                   |",
    "          did it object?               |",
    "            |          |               |",
    "           YES         NO              |",
    "            |          |               |",
    "            v          |               |",
    "   +----------------+  |               |",
    "   |  THE JUDGE     |  |               |",
    "   |  reads the law |  |               |",
    "   |  and rules     |  |               |",
    "   +--------+-------+  |               |",
    "            |          |               |",
    "     SUSTAINED  OVERRULED              |",
    "       |            |                  |",
    "       v            +--------+---------+",
    "     STOP                    |",
    "  (no answer)                v",
    "                 WITNESS ANSWERS,  or",
    "                 OPPOSING COUNSEL ARGUES,  or",
    "                 THE JUDGE RESPONDS",
    "",
])

BOX(
    "WHY THIS CANNOT BE DONE WITH ONE PROMPT",
    [
        "One AI told to \"play all the characters\" cannot reliably produce "
        "this sequence: <i>opposing counsel objects, then the judge looks up "
        "the law and rules, and only then does the witness answer - or not</i>.",
        "That is three agents acting one after another on a single question, "
        "where the second one's decision controls whether the third ever "
        "speaks at all. Here, that is just a path through the flowchart.",
    ],
)

H("A rule enforced by the structure, not by asking politely")

P(
    "Look at the diagram again. When the judge <b>sustains</b> an objection, "
    "the arrow goes to <b>STOP</b>. There is no arrow from there to the "
    "witness."
)
P(
    "This means the witness <b>cannot</b> answer a struck question. Not "
    "because the AI was instructed not to, but because there is no route in "
    "the flowchart that would let it. You cannot trick the system into "
    "breaking this rule, because you would have to trick it into using a path "
    "that does not exist."
)
P(
    "This was tested across 32 different scenarios: <b>zero</b> cases where a "
    "witness answered a struck question."
)

H("Everything is bounded")

P(
    "Every loop in the system has a hard limit written into the code. The "
    "judge's research loop stops after 3 rounds. The flowchart itself has no "
    "cycles at all. An AI system that can loop forever is a system that can "
    "run up an unlimited bill, and this one cannot."
)

story.append(PageBreak())

# ===========================================================================
PART(6, "How the judge decides an objection")

P(
    "This is probably the most technically interesting part of the project, "
    "and the answer to \"what does the judge base its decision on?\""
)

H("The judge is not allowed to answer from memory")

P(
    "A normal AI, asked \"is this a leading question under Article 137?\", "
    "would answer immediately from whatever it happens to remember. That is "
    "exactly what we do not want, because what it remembers may be wrong, and "
    "it will sound equally confident either way."
)
P(
    "Instead the judge is built as a <b>ReAct agent</b>. ReAct is short for "
    "<i>Reasoning and Acting</i>. The agent alternates between thinking and "
    "using a tool, in a loop, until it knows enough to answer."
)
P(
    "The judge has exactly <b>one</b> tool, called <code>search_statute</code>, "
    "which searches the law database described in Part 4. That tool is the "
    "only way it can reach the law at all."
)

H("What one ruling actually looks like inside")

CODE([
    "",
    "  THOUGHT:   This is a leading-question objection under Article 137.",
    "             I need to read 137 together with its neighbours before",
    "             I can rule.",
    "",
    "  ACTION:    search_statute(\"leading questions examination-in-chief\")",
    "",
    "  OBSERVE:   QSO 1984 Art. 136 - Leading questions defined",
    "             QSO 1984 Art. 137 - When they must not be asked",
    "             QSO 1984 Art. 138 - When they may be asked",
    "",
    "  THOUGHT:   137 allows leading on introductory or undisputed matters.",
    "             This question goes to a fact that IS disputed, and we are",
    "             in examination-in-chief. So the exception does not apply.",
    "",
    "  RULING:    SUSTAINED, citing QSO 1984 Art. 137",
    "",
])

P(
    "This is exactly the situation flagged at the end of Part 2: you cannot "
    "decide a leading-question objection from Article 137 alone. The judge "
    "goes and fetches the neighbouring articles because the law genuinely "
    "requires reading them together."
)

H("Three things that make this trustworthy rather than decorative")

BULLETS([
    "<b>It is forbidden from ruling on law it has not read.</b> The judge's "
    "instructions say plainly: rule only on statutory text you have actually "
    "read, and do not invent an article that did not appear in what the tool "
    "returned.",
    "<b>Every step is recorded.</b> Each thought, each search, and each result "
    "is saved. The ruling is not merely grounded in the law - it can be "
    "<i>shown</i> to be grounded, step by step.",
    "<b>The loop is capped at 3 rounds.</b> Enough to read a provision and its "
    "neighbours, and no more. This limits both the waiting time and the cost "
    "of a single ruling.",
])

BOX(
    "WHAT HAPPENS IF IT FAILS",
    [
        "If the judge uses up its 3 rounds without reaching a decision, the "
        "system asks it once more, firmly, with no tools available.",
        "If even that fails, the objection is <b>overruled</b> by default. "
        "That direction was chosen deliberately: overruling lets a possibly "
        "proper question stand, whereas sustaining by default would strike a "
        "question that may have been perfectly fine. When you must guess, "
        "guess in the direction that does less damage.",
    ],
)

story.append(PageBreak())

# ===========================================================================
PART(7, "How opposing counsel objects on its own")

P(
    "This is the feature that turns a polite question-and-answer session into "
    "an actual adversarial hearing."
)
P(
    "<b>Nobody presses a button.</b> After every single question the student "
    "puts to a witness, the opposing counsel agent independently decides "
    "whether that question was improper. If it was, it interrupts."
)

H("It physically cannot invent a law")

P(
    "The list of grounds it is allowed to object on is built at runtime from "
    "the law database itself. If the AI tries to object on a ground that is "
    "not on that list, <b>the objection is thrown away</b> rather than shown "
    "to the student."
)
P(
    "So every objection the student ever hears is backed by a provision that "
    "genuinely exists - not because the AI was asked nicely, but because an "
    "objection without a real provision cannot survive the code."
)

H("The hard part was teaching it to stay quiet")

P(
    "The first version objected too much. Testing caught it objecting "
    "\"leading question\" to this:"
)

BOX(
    "THE QUESTION IT WRONGLY OBJECTED TO",
    [
        "<i>\"What did you see outside the market that evening?\"</i>",
        "This is a perfectly proper open question. It begins with \"what\" and "
        "leaves the entire answer to the witness. The AI appears to have "
        "objected because the subject was important, not because the form of "
        "the question was wrong.",
    ],
    accent=VERMILION,
)

P(
    "A lawyer who objects to everything is not a tough opponent - they are "
    "just noise, and a student learns nothing from them. Worse, the student "
    "might learn a rule that is simply false."
)
P(
    "The fix was to write the actual legal test into the AI's instructions "
    "explicitly (the test in Part 2: does the question put the answer into "
    "the witness's mouth?), including the specific note that questions "
    "starting with what, where, when, who, why or how are not leading "
    "<i>however important the subject is</i>."
)
P("Result, measured over 32 labelled test scenarios:")

TABLE(
    [
        ["Measure", "In plain English", "Score"],
        ["Precision", "When it objected, was it right?", "<b>1.00</b> "
         "(always)"],
        ["Recall", "Did it catch every improper question?", "<b>1.00</b> "
         "(all of them)"],
        ["Specificity", "Did it stay quiet on proper questions?", "<b>1.00</b> "
         "(always)"],
        ["Ground accuracy", "Did it name the correct legal reason?",
         "<b>100%</b>"],
    ],
    widths=[32 * mm, 92 * mm, 39 * mm],
)

H("Saving money without lowering quality")

P(
    "The objection check runs after <b>every</b> question, and honestly, most "
    "questions are fine. Paying for the most expensive AI model to say "
    "\"no objection\" hundreds of times is wasteful."
)
P(
    "So the system uses a <b>cascade</b>: a cheap, fast model looks at every "
    "question first. If it sees nothing wrong, that is the end - cheaply. If "
    "it thinks something <i>is</i> wrong, the question is passed to the "
    "expensive model, which makes the real decision."
)
P(
    "This is deliberately lopsided. A missed objection costs the student very "
    "little. But <b>teaching a law student a wrong rule is the expensive "
    "failure</b>, so every objection the student actually hears has been "
    "checked by the strong model."
)

TABLE(
    [
        ["", "Before cascade", "After cascade"],
        ["Question with no objection", "$0.0041, 3.5 sec",
         "<b>$0.0020, 2.3 sec</b>"],
        ["Question with an objection", "$0.0153", "$0.0153 (1.7 sec slower)"],
        ["Average per turn", "$0.0104", "<b>$0.0095</b>"],
    ],
    widths=[62 * mm, 50 * mm, 51 * mm],
)

P(
    "Accuracy was identical before and after. All of the saving comes from "
    "the quiet questions.",
    "foot",
)

story.append(PageBreak())

# ===========================================================================
PART(8, "How the AI remembers the session")

P(
    "AI models have a limited working memory. In a long session, the opening "
    "argument would scroll out of view long before the closing argument "
    "begins. That would be a serious problem here, because catching a student "
    "who contradicts themselves is one of the most useful things a courtroom "
    "opponent can do."
)
P("So the system keeps memory in two layers:")

TABLE(
    [
        ["Layer", "What it holds", "Cost"],
        ["<b>Working memory</b>", "Every exchange in the current phase, word "
         "for word.", "Free"],
        ["<b>Long-term memory</b>", "A structured summary of everything "
         "before it: a narrative summary, a list of claims the student "
         "committed to, what each witness said, and any directions the judge "
         "gave.", "About 4 AI calls per whole session"],
    ],
    widths=[35 * mm, 98 * mm, 30 * mm],
)

P(
    "The long-term memory is kept as a <b>structured list</b> rather than a "
    "flowing paragraph. That is deliberate: the list of \"things the student "
    "has claimed\" is precisely what a contradiction check needs to compare "
    "against. Blending it into prose would make that comparison fuzzy and "
    "unreliable."
)
P(
    "The summary is only rewritten when the session moves from one phase to "
    "the next - not after every single sentence. Within a phase the AI can "
    "already see the raw exchanges, so summarising them would be paying money "
    "to produce information it is not missing."
)

BOX(
    "WHAT THIS BUYS YOU",
    [
        "Because of this memory, the opposing counsel can say something like: "
        "<i>\"My learned friend told this court in his opening that his client "
        "was not present at the site. He now says his client witnessed the "
        "demolition. Which is it?\"</i>",
        "That is the behaviour that makes the simulator feel like a real "
        "opponent rather than a chatbot.",
    ],
    accent=SEAL,
)

story.append(PageBreak())

# ===========================================================================
PART(9, "How the student is marked")

P(
    "Marking is a completely separate mechanism from ruling on objections. "
    "At the end of a session, three things happen <b>before</b> the AI is "
    "asked to give any marks."
)

BULLETS([
    "<b>Step 1 - Check every law the student cited.</b> The system pulls every "
    "statutory reference out of what the student said and looks each one up in "
    "the database. Each is marked as existing, or not existing.",
    "<b>Step 2 - Look up the law that actually governs the case.</b> This lets "
    "the judge tell the difference between a student who <i>missed</i> the key "
    "provision and one who found it but argued it badly.",
    "<b>Step 3 - Hand the judge the results of Step 1 as fact.</b>",
])

BOX(
    "THE INSTRUCTION THAT ANCHORS THE MARKS",
    [
        "The marking AI is told, in effect:",
        "<i>\"A citation marked DOES NOT EXIST is a serious failure of legal "
        "reasoning, however confident the student sounded, and you must say "
        "so explicitly. Do not give a student credit for engaging with a "
        "provision they invented.\"</i>",
        "This is what stops the marks from measuring how <i>convincing</i> the "
        "student sounded, and makes them measure whether the law they relied "
        "on is real.",
    ],
)

P("The student receives five scores out of 100:")

TABLE(
    [
        ["Score", "What it measures"],
        ["<b>Legal reasoning</b>", "Was the law correctly identified, "
         "correctly cited, and correctly applied?"],
        ["<b>Persuasiveness</b>", "Was the argument clear, confident and "
         "convincing?"],
        ["<b>Procedural command</b>", "Did the student follow courtroom "
         "procedure and etiquette?"],
        ["<b>Factual command</b>", "Did the student know the facts of their "
         "own case and the testimony given?"],
        ["<b>Overall</b>", "A weighted combination of the four."],
    ],
    widths=[40 * mm, 123 * mm],
)

P(
    "Plus written remarks from the bench, a list of strengths, and a list of "
    "areas to improve."
)

H("The marks are checked before they are saved")

P(
    "The AI's answer is not simply trusted. If any score is not a proper "
    "number, or if the AI names a winning side that is not even a party to "
    "this case, the whole verdict is <b>rejected</b> and never written to the "
    "database. A nonsense verdict never reaches the student."
)

H("Does the marking actually discriminate?")

P(
    "This was tested by writing three fake transcripts on purpose - a strong "
    "one, a mixed one, and a deliberately bad one - and marking them:"
)

TABLE(
    [
        ["Transcript", "Marks given", "Citations that were real"],
        ["Strong performance", "<b>85</b>", "100%"],
        ["Mixed performance", "<b>55</b>", "-"],
        ["Weak performance", "<b>28</b>", "0%"],
    ],
    widths=[55 * mm, 45 * mm, 63 * mm],
)

P(
    "The ordering is correct and the gaps are wide. Crucially, the weak "
    "transcript's citations were all fake, and the marks reflected that - "
    "which shows the judge is reading the citation check, not just reacting "
    "to how the writing sounded.",
    "foot",
)

story.append(PageBreak())

# ===========================================================================
PART(10, "How the system stays honest")

P(
    "This is the part to lead with when explaining the project, because it is "
    "the part most similar projects do not have."
)

BOX(
    "THE MOST IMPORTANT DISCLOSURE",
    [
        "All <b>53</b> provisions in the database were written from an AI "
        "model's knowledge. <b>They have not yet been checked, word for word, "
        "against the official government source</b> (pakistancode.gov.pk).",
        "So the system marks <b>every single one</b> as unverified. This "
        "warning appears in the AI's own instructions, and appears on screen "
        "beside every citation the student sees.",
        "<b>This is a feature, not an embarrassment.</b> A system that knows "
        "and states what it has not checked is more trustworthy than one that "
        "presents everything with equal confidence.",
    ],
    accent=VERMILION,
)

H("Citations are checked before they are spoken, not after")

P(
    "When an AI agent says something during a live session, its citations are "
    "checked <b>before</b> the words are played as audio. This means if the AI "
    "cites something that does not exist, the warning is already on screen "
    "while the student is still hearing the sentence."
)
P(
    "This is affordable because the check is a simple text-pattern search "
    "against a list already held in memory. It costs no money at all, which "
    "is what makes it practical to run on every single line."
)

H("A real bug this testing caught")

P(
    "The system was attacked on purpose with 36 crafted attempts to make it "
    "misbehave. During those tests, the citation checker flagged the "
    "<b>judge</b> for inventing a law - but the judge had done nothing wrong. "
    "The <i>student</i> had invented a fake section number, and the judge was "
    "correctly naming it in order to <b>reject</b> it."
)
P(
    "The checker simply could not tell the difference between an AI "
    "<i>relying</i> on a fake law and an AI <i>refusing</i> one. So the code "
    "was changed: anything the student already said is tracked separately, and "
    "the figure shown to users counts only what the AI introduced by itself."
)

H("Result of the attack testing")

P(
    "<b>0 out of 36 attacks succeeded.</b> None of them. Interestingly, "
    "attacks aimed at inflating the student's marks made the marks go "
    "<i>down</i>."
)

BOX(
    "A DECISION NOT TO BUILD SOMETHING",
    [
        "The obvious next step would be to build a defensive filter against "
        "such attacks. It was <b>deliberately not built</b>.",
        "The reason: nothing got through, so a filter would improve nothing "
        "measurable while adding code, cost and latency. It also turned out "
        "the system already defends itself for a rather elegant reason - when "
        "an attacker hides an instruction inside their spoken argument, the "
        "opposing counsel agent <b>objects to it as irrelevant</b>.",
        "The rule adopted: build the filter when an attack actually lands, "
        "and add that attack to the test set first.",
    ],
    accent=SEAL,
)

story.append(PageBreak())

# ===========================================================================
PART(11, "The voice part")

P(
    "The student speaks, and the courtroom speaks back. Each character has a "
    "different synthesised voice, so you can tell the judge from opposing "
    "counsel from the witness by ear alone."
)

H("The waiting problem, and how it was fixed")

P(
    "The first version waited until the entire turn had finished being "
    "thought through before playing any audio. Since a single turn can "
    "involve opposing counsel objecting <i>and</i> the judge researching the "
    "law <i>and</i> ruling, the student sat in silence for "
    "<b>16.1 seconds</b>."
)
P(
    "The fix was to send each agent's words out <b>the moment that agent "
    "finishes</b>, instead of waiting for the whole sequence."
)

TABLE(
    [
        ["", "Before", "After"],
        ["Silence before any sound", "16.1 sec", "<b>8.1 sec</b>"],
        ["Opposing counsel first heard", "-", "<b>6.9 sec</b>"],
    ],
    widths=[63 * mm, 50 * mm, 50 * mm],
)

P(
    "The objection is now spoken aloud <i>while the judge is still reading the "
    "statute in the background</i>. The student hears the interruption at the "
    "moment a real opponent would have made it."
)

H("Interrupting the court")

P(
    "A real advocate objects <i>over</i> the answer, not politely after it has "
    "finished. So while the court is speaking, the microphone stays open. If "
    "the student starts talking, the audio cuts immediately and whatever they "
    "said is sent to the judge as a possible objection."
)

BOX(
    "AN HONEST LIMITATION",
    [
        "The voice system has been proven to work end-to-end using "
        "computer-generated speech as the input.",
        "It has <b>never been tested with a real microphone and real "
        "speakers</b>. That test needs a physical device and is still "
        "outstanding.",
    ],
    accent=VERMILION,
)

story.append(PageBreak())

# ===========================================================================
PART(12, "The numbers, and what is left to do")

P(
    "Every claim in this document is backed by a measurement that can be "
    "re-run. Here they are together."
)

TABLE(
    [
        ["What was measured", "Result"],
        ["Finding the right law - before reranking",
         "Correct provision ranked 1st in <b>90%</b> of test queries"],
        ["Finding the right law - after reranking",
         "Correct provision ranked 1st in <b>100%</b> of test queries"],
        ["Objection decisions (32 scenarios)",
         "Precision <b>1.00</b>, recall <b>1.00</b>, specificity <b>1.00</b>"],
        ["Naming the correct legal ground", "<b>100%</b>"],
        ["Witness answering a struck question", "<b>0</b> occurrences"],
        ["Marking three planted transcripts",
         "<b>85</b> / <b>55</b> / <b>28</b> - correctly ordered"],
        ["Deliberate attacks that succeeded", "<b>0</b> out of 36"],
        ["Average cost per spoken turn", "<b>$0.0095</b>"],
        ["Silence before the first audio", "<b>8.1 sec</b> (was 16.1)"],
    ],
    widths=[80 * mm, 83 * mm],
)

BOX(
    "TWO NUMBERS TO BE CAREFUL WITH",
    [
        "Two measurements are known to move between runs even when nothing "
        "has changed in the code: the judge's <i>ruling</i> accuracy has been "
        "seen at 94% and at 89%, and the spread of marks on the weak "
        "transcript has varied a lot between days.",
        "<b>Never quote either from a single run.</b> Run it three times and "
        "quote the average, or say plainly that it is one run. Volunteering "
        "this yourself is far stronger than being caught on it.",
    ],
    accent=VERMILION,
)

H("What is still unfinished")

TABLE(
    [
        ["Task", "Why it matters", "Blocking?"],
        ["<b>Verify the 53 provisions</b> against the official government "
         "source, then switch each one's flag to verified",
         "Until this is done, the system cannot claim to quote real Pakistani "
         "law. It is manual reading work and costs nothing.",
         "<b>Yes</b>"],
        ["<b>Test the voice with a real microphone</b>",
         "Everything else in the voice path is proven; only the physical "
         "device path is unconfirmed.",
         "<b>Yes</b>"],
        ["Move the last two pieces of AI logic out of the API server and into "
         "the Python service",
         "Two features still build AI instructions in the wrong place. It "
         "works, but it weakens the clean boundary described in Part 3.",
         "No"],
        ["Operational tooling: request tracing, automated testing on every "
         "code change, containerisation, showing cost per session in the app",
         "Cost and speed are already measured per AI call; the rest is "
         "polish.",
         "No"],
    ],
    widths=[52 * mm, 87 * mm, 24 * mm],
)

GAP(6)
P(
    "Prepared from the Adalat AI source code as it stood on 4 August 2026. "
    "All measurements are from the project's own evaluation harness and can "
    "be reproduced by re-running it.",
    "foot",
)


# ===========================================================================
def decorate(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)
    canvas.line(24 * mm, 16 * mm, 187 * mm, 16 * mm)
    canvas.setFont("Courier", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(24 * mm, 11 * mm, "ADALAT AI  /  HOW IT WORKS")
    canvas.drawRightString(187 * mm, 11 * mm, str(canvas.getPageNumber()))
    canvas.restoreState()


doc = BaseDocTemplate(
    OUT,
    pagesize=A4,
    leftMargin=24 * mm,
    rightMargin=23 * mm,
    topMargin=20 * mm,
    bottomMargin=22 * mm,
    title="Adalat AI - How It Works",
    author="Adalat AI",
    subject="A plain-English guide to the Adalat AI moot-court simulator",
)
frame = Frame(
    doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="body"
)
doc.addPageTemplates([
    PageTemplate(id="main", frames=[frame], onPage=decorate)
])
doc.build(story)
print(f"wrote {OUT}")
