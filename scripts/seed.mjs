import pg from "../lib/db/node_modules/pg/lib/index.js";
import fs from "fs";
import path from "path";

const dir = typeof import.meta !== "undefined" && import.meta.dirname ? import.meta.dirname : process.cwd();
const possibleEnvPaths = [
  path.resolve(dir, "../.env"),
  path.resolve(process.cwd(), ".env"),
  ".env",
];

for (const envPath of possibleEnvPaths) {
  try {
    process.loadEnvFile(envPath);
    if (process.env.DATABASE_URL) break;
  } catch {}
}

const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:123456@localhost:5432/legal_case_sim";
const client = new pg.Client({ connectionString: databaseUrl });

/**
 * The corpus, read from the same JSON the ingest script reads.
 *
 * Seed cases used to carry `applicableLaws` as hand-written prose, and three of
 * them cited instruments the corpus has never held — CPC 1908, the Specific
 * Relief Act 1877, the West Pakistan Land Revenue Act 1967. Nothing caught it:
 * the citation audit only extracts instruments it has an alias for, so an
 * unknown Act is not reported as fabricated, it is not seen at all. The library
 * therefore displayed law the simulator could not argue, on the first screen a
 * student opens.
 *
 * So provisions are now declared as [statuteCode, sectionNumber] pairs and
 * resolved here. `applicableLaws` is derived from what resolves, never typed by
 * hand, which is the same rule generated cases already follow in
 * routes/cases.ts. A pair that does not resolve aborts the seed.
 */
function loadCorpus() {
  const corpusDir = path.resolve(dir, "../data/statutes");
  const byKey = new Map();

  for (const file of fs.readdirSync(corpusDir).filter((f) => f.endsWith(".json"))) {
    const instrument = JSON.parse(fs.readFileSync(path.join(corpusDir, file), "utf8"));
    for (const section of instrument.sections) {
      byKey.set(`${instrument.statuteCode}:${section.sectionNumber.toUpperCase()}`, {
        citation: `${instrument.citationPrefix} ${instrument.citationUnit}${section.sectionNumber}`,
        statuteCode: instrument.statuteCode,
        heading: section.heading,
        // Per-provision flag wins; absent means inherit the instrument default.
        verified: section.verified ?? Boolean(instrument.verified),
      });
    }
  }

  return byKey;
}

/** Resolves a case's declared provisions, or throws naming every miss. */
function resolveCitations(corpus, title, provisions) {
  const resolved = [];
  const missing = [];

  for (const [statuteCode, sectionNumber] of provisions) {
    const entry = corpus.get(`${statuteCode}:${sectionNumber.toUpperCase()}`);
    if (entry) resolved.push(entry);
    else missing.push(`${statuteCode} ${sectionNumber}`);
  }

  if (missing.length > 0) {
    throw new Error(
      `"${title}" cites provisions absent from the corpus: ${missing.join(", ")}. ` +
        `Add them to data/statutes and re-run statutes:ingest, or cite something else.`
    );
  }

  return resolved;
}

const sampleCases = [
  {
    title: "State v. Muhammad Aslam",
    areaOfLaw: "Criminal",
    difficulty: "Intermediate",
    summary: "The State charges the accused with murder following a dispute over agricultural land in District Kasur. The defense contends alibi and eyewitness testimony inconsistency under Qanun-e-Shahadat Order 1984 Article 17.",
    // Was "PPC 1860 s. 302, QSO 1984 Art. 17 & 22". QSO Art. 22 is not in the
    // corpus, and the extractor never saw it — an ampersand-joined number
    // carries no provision word, so it parsed as one citation, not two.
    provisions: [
      ["PPC_1860", "300"],
      ["PPC_1860", "302"],
      ["QSO_1984", "17"],
      ["QSO_1984", "71"],
    ],
    petitionerName: "State Prosecutor",
    petitionerRole: "Complainant / State",
    respondentName: "Muhammad Aslam",
    respondentRole: "Accused / Defense",
    witnesses: JSON.stringify([
      {
        name: "Tariq Mahmood",
        role: "Eyewitness",
        statement: "I saw the altercation near the canal bridge at dusk. The accused was carrying a blunt weapon."
      },
      {
        // Cited "Article 40 of QSO" — a provision the corpus does not hold, and
        // unlike the instrument-level misses this one the extractor *does* read,
        // so seeded testimony was feeding the audit a fabricated citation.
        name: "Inspector Chaudhry Raza",
        role: "Investigating Officer",
        statement: "I recovered the weapon of offence from the spot pointed out by the accused during investigation."
      }
    ]),
    source: "library"
  },
  {
    title: "Tariq Khan v. Capital Development Authority",
    areaOfLaw: "Civil",
    difficulty: "Beginner",
    summary: "Petitioner seeks a permanent injunction restraining the CDA from demolishing a commercial property in Sector F-7, Islamabad, alleging valid lease deed and procedural non-compliance.",
    // Was CPC 1908 Order 39 and Specific Relief Act 1877 — neither instrument is
    // in the corpus, and neither has an alias in the extractor, so both passed
    // the audit by being invisible to it. The corpus holds no civil substantive
    // law at all, so this case is now pinned to what genuinely governs it on the
    // evidence and on the authority's conduct: proving the lease deed, and Art. 4.
    // Restore the Order 39 / Specific Relief citations once those Acts are
    // ingested — they are the better answer, they are simply not available.
    provisions: [
      ["CONST_1973", "4"],
      ["QSO_1984", "75"],
      ["QSO_1984", "76"],
    ],
    petitionerName: "Tariq Khan",
    petitionerRole: "Petitioner / Property Owner",
    respondentName: "CDA Enforcement Directorate",
    respondentRole: "Respondent / Public Authority",
    witnesses: JSON.stringify([
      {
        name: "Ghulam Nabi",
        role: "Revenue Officer (Patwari)",
        statement: "The land ownership entry in Khasra Girdawari matches the allotment record from 2012."
      },
      {
        name: "Zubair Ahmad",
        role: "Urban Architect",
        statement: "The construction plan was submitted for approval prior to building commencement."
      }
    ]),
    source: "library"
  },
  {
    title: "Asma Bibi v. Board of Revenue",
    areaOfLaw: "Constitutional",
    difficulty: "Advanced",
    summary: "Constitutional writ petition under Article 199 challenging executive revenue circulars that deny female heirs equal mutation rights in ancestral agricultural land under Article 25.",
    // Dropped the West Pakistan Land Revenue Act 1967 s. 42 — not in the corpus,
    // and invisible to the extractor for want of an alias. Art. 4 replaces it as
    // the hook for circulars that depart from the law.
    provisions: [
      ["CONST_1973", "4"],
      ["CONST_1973", "25"],
      ["CONST_1973", "199"],
    ],
    petitionerName: "Asma Bibi",
    petitionerRole: "Petitioner",
    respondentName: "Board of Revenue Punjab",
    respondentRole: "Respondent",
    witnesses: JSON.stringify([
      {
        name: "Dr. Farooq Ahmad",
        role: "Islamic Jurisprudence Scholar",
        statement: "Muslim Personal Law strictly protects fixed Quranic shares for female heirs without executive delay."
      },
      {
        name: "Salim Tehsildar",
        role: "Tehsildar kasur",
        statement: "The mutation was deferred pending male co-sharers NOC per provincial administrative instructions."
      }
    ]),
    source: "library"
  }
];

async function seed() {
  try {
    const corpus = loadCorpus();

    // Resolved before the first write, so a case citing law the corpus lacks
    // fails the whole seed rather than leaving the library half-updated.
    const prepared = sampleCases.map((c) => {
      const citations = resolveCitations(corpus, c.title, c.provisions);
      return {
        ...c,
        citations,
        // Identical to how routes/cases.ts renders a generated case, so a
        // library case and a drafted one are indistinguishable in the UI.
        applicableLaws: citations
          .map((entry) => `${entry.citation} (${entry.heading})`)
          .join(", "),
      };
    });

    await client.connect();
    console.log("Connected to DB for seeding...");

    for (const c of prepared) {
      const existing = await client.query("SELECT id FROM cases WHERE title = $1", [c.title]);
      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO cases (title, area_of_law, difficulty, summary, applicable_laws, petitioner_name, petitioner_role, respondent_name, respondent_role, witnesses, citations, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12)`,
          [c.title, c.areaOfLaw, c.difficulty, c.summary, c.applicableLaws, c.petitionerName, c.petitionerRole, c.respondentName, c.respondentRole, c.witnesses, JSON.stringify(c.citations), c.source]
        );
        console.log(`Seeded case: ${c.title}`);
      } else {
        // Re-running the seed repairs the law on a case that is already stored.
        // Skipping it would leave every existing install showing the uncovered
        // citations this change exists to remove, since these rows are only ever
        // written here. Student-facing fields the seed owns are refreshed;
        // sessions reference the case by id and are untouched.
        await client.query(
          `UPDATE cases SET applicable_laws = $2, citations = $3::jsonb, witnesses = $4::jsonb, summary = $5
           WHERE title = $1 AND source = 'library'`,
          [c.title, c.applicableLaws, JSON.stringify(c.citations), c.witnesses, c.summary]
        );
        console.log(`Refreshed case: ${c.title} (${c.citations.length} provisions)`);
      }
    }
    console.log("Seeding complete!");
  } catch (err) {
    console.error("Seeding error:", err.message);
    // Exit non-zero: the old handler logged and returned 0, so a failed seed
    // was indistinguishable from a clean one to anything scripting this.
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

seed();
