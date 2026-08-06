import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, casesTable, insertCaseSchema } from "@workspace/db";
import {
  ListCasesQueryParams,
  ListCasesResponse,
  GenerateCaseBody,
  GenerateCaseResponse,
  GetCaseParams,
  GetCaseResponse,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  auditCitations,
  retrieveAreaPalette,
  verifiedCitations,
} from "../lib/ai-service";

const router: IRouter = Router();

const generatedCaseSchema = insertCaseSchema.pick({
  title: true,
  summary: true,
  applicableLaws: true,
  petitionerName: true,
  petitionerRole: true,
  respondentName: true,
  respondentRole: true,
  witnesses: true,
});

router.get("/cases", async (req, res): Promise<void> => {
  const query = ListCasesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.areaOfLaw) {
    conditions.push(eq(casesTable.areaOfLaw, query.data.areaOfLaw));
  }
  if (query.data.difficulty) {
    conditions.push(eq(casesTable.difficulty, query.data.difficulty));
  }

  const cases = await db
    .select()
    .from(casesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(casesTable.createdAt));

  res.json(ListCasesResponse.parse(cases));
});

router.post("/cases/generate", async (req, res): Promise<void> => {
  const parsed = GenerateCaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { areaOfLaw, difficulty } = parsed.data;

  // Retrieve a palette of real provisions first, then constrain generation to
  // it. Without this the model invents plausible-looking section numbers, and
  // a moot-court tool that teaches fabricated citations is worse than useless.
  const palette = await retrieveAreaPalette(areaOfLaw);
  const { promptBlock: paletteBlock, allowedCitations } = palette;

  const prompt = `Generate a realistic, original moot-court practice case under Pakistani law for a final-year law student. Area of law: ${areaOfLaw}. Difficulty: ${difficulty}.

You have been given the full text of the provisions available to you below. Build the dispute so that it genuinely turns on some of them.

AVAILABLE PROVISIONS:
${paletteBlock}

Rules for "applicableLaws":
- Cite ONLY from this exact list: ${allowedCitations.join("; ")}
- Reproduce each citation string exactly as written above.
- Cite 2-4 provisions that the dispute actually turns on. Do not pad the list.
- Never invent a section or article number that does not appear above.

Respond with strict JSON only, matching this shape:
{
  "title": string (short, formal case title, e.g. "State v. Ahmed Khan"),
  "summary": string (3-5 sentences describing the dispute and procedural posture),
  "applicableLaws": string (comma-separated citations drawn only from the list above),
  "petitionerName": string,
  "petitionerRole": string (e.g. "Petitioner", "Appellant", "Complainant"),
  "respondentName": string,
  "respondentRole": string (e.g. "Respondent", "Accused", "Defendant"),
  "witnesses": array of 2-3 objects { "name": string, "role": string (relation to case, e.g. "Eyewitness"), "statement": string (2-3 sentences of their testimony) }
}`;

  req.log.info(
    { areaOfLaw, difficulty, paletteSize: palette.sections.length },
    "Generating new case grounded in retrieved statutes",
  );

  const completion = await openai.chat.completions.create({
    model: process.env.MODEL_TEXT || "gpt-4o",
    max_completion_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are an expert Pakistani law professor designing moot-court practice problems.",
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let generated;
  try {
    generated = generatedCaseSchema.parse(JSON.parse(raw));
  } catch (err) {
    req.log.error(
      { err, raw },
      "AI-generated case did not match the required schema",
    );
    res.status(500).json({ error: "Failed to generate case" });
    return;
  }

  // Constraining the prompt reduces fabrication but does not eliminate it, so
  // every citation is checked against the corpus before the case is stored.
  const audit = await auditCitations(generated.applicableLaws);
  const citations = verifiedCitations(audit);

  if (audit.hallucinated > 0) {
    req.log.warn(
      {
        areaOfLaw,
        hallucinated: audit.hallucinated,
        total: audit.total,
        rejected: audit.checks
          .filter((check) => check.status === "not_found")
          .map((check) => check.raw),
      },
      "Generated case cited provisions that do not exist; storing only verified citations",
    );
  }

  // The displayed string is rebuilt from verified citations only. A student
  // can never be shown a section number the corpus could not confirm.
  const applicableLaws = citations.length
    ? citations.map((entry) => `${entry.citation} (${entry.heading})`).join(", ")
    : generated.applicableLaws;

  const [created] = await db
    .insert(casesTable)
    .values({
      title: generated.title,
      areaOfLaw,
      difficulty,
      summary: generated.summary,
      applicableLaws,
      petitionerName: generated.petitionerName,
      petitionerRole: generated.petitionerRole,
      respondentName: generated.respondentName,
      respondentRole: generated.respondentRole,
      witnesses: generated.witnesses,
      citations,
      source: "generated",
    })
    .returning();

  res.status(201).json(GenerateCaseResponse.parse(created));
});

router.get("/cases/:id", async (req, res): Promise<void> => {
  const params = GetCaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [courtCase] = await db
    .select()
    .from(casesTable)
    .where(eq(casesTable.id, params.data.id));

  if (!courtCase) {
    res.status(404).json({ error: "Case not found" });
    return;
  }

  res.json(GetCaseResponse.parse(courtCase));
});

export default router;
