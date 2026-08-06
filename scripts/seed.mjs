import pg from "../lib/db/node_modules/pg/lib/index.js";
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

const sampleCases = [
  {
    title: "State v. Muhammad Aslam",
    areaOfLaw: "Criminal",
    difficulty: "Intermediate",
    summary: "The State charges the accused with murder following a dispute over agricultural land in District Kasur. The defense contends alibi and eyewitness testimony inconsistency under Qanun-e-Shahadat Order 1984 Article 17.",
    applicableLaws: "Pakistan Penal Code 1860 s. 302, Qanun-e-Shahadat Order 1984 Art. 17 & 22",
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
        name: "Inspector Chaudhry Raza",
        role: "Investigating Officer",
        statement: "I recovered the weapon of offense upon disclosure by the accused under Article 40 of QSO."
      }
    ]),
    source: "library"
  },
  {
    title: "Tariq Khan v. Capital Development Authority",
    areaOfLaw: "Civil",
    difficulty: "Beginner",
    summary: "Petitioner seeks a permanent injunction restraining the CDA from demolishing a commercial property in Sector F-7, Islamabad, alleging valid lease deed and procedural non-compliance.",
    applicableLaws: "Civil Procedure Code 1908 Order 39 Rules 1-2, Specific Relief Act 1877 s. 42 & 54",
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
    applicableLaws: "Constitution of Pakistan 1973 Art. 199 & Art. 25, West Pakistan Land Revenue Act 1967 s. 42",
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
    await client.connect();
    console.log("Connected to DB for seeding...");
    for (const c of sampleCases) {
      const existing = await client.query("SELECT id FROM cases WHERE title = $1", [c.title]);
      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO cases (title, area_of_law, difficulty, summary, applicable_laws, petitioner_name, petitioner_role, respondent_name, respondent_role, witnesses, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)`,
          [c.title, c.areaOfLaw, c.difficulty, c.summary, c.applicableLaws, c.petitionerName, c.petitionerRole, c.respondentName, c.respondentRole, c.witnesses, c.source]
        );
        console.log(`Seeded case: ${c.title}`);
      } else {
        console.log(`Case already exists: ${c.title}`);
      }
    }
    console.log("Seeding complete!");
  } catch (err) {
    console.error("Seeding error:", err.message);
  } finally {
    await client.end();
  }
}

seed();
