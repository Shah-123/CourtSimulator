/**
 * Ingests the Pakistani statute corpus in `data/statutes/*.json` into the
 * `statute_sections` table and embeds every provision.
 *
 * Chunking is structural, not fixed-window: one row per section or Article,
 * because that is the unit lawyers cite and the unit that stays meaningful
 * when retrieved in isolation.
 *
 * The job is idempotent. Re-running it updates changed text and only spends
 * embedding calls on provisions whose content or embedding model changed.
 *
 *   node ./scripts/ingest-statutes.mjs            # incremental
 *   node ./scripts/ingest-statutes.mjs --force    # re-embed everything
 */
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { createHash } from "crypto";
import { readdir, readFile } from "fs/promises";
import path from "path";

const dir = import.meta.dirname ?? process.cwd();

for (const envPath of [
  path.resolve(dir, "../.env"),
  path.resolve(process.cwd(), ".env"),
  ".env",
]) {
  try {
    process.loadEnvFile(envPath);
    if (process.env.DATABASE_URL) break;
  } catch {}
}

const DATABASE_URL = process.env.DATABASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = process.env.MODEL_EMBEDDING || "text-embedding-3-small";
const CORPUS_DIR = path.resolve(dir, "../data/statutes");
const FORCE = process.argv.includes("--force");
const BATCH_SIZE = 64;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env before ingesting.");
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error(
    "OPENAI_API_KEY is not set. Embeddings cannot be generated without it.",
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });

/** Light structural validation so a malformed corpus file fails loudly. */
function validateCorpusFile(data, fileName) {
  const required = [
    "statuteCode",
    "statuteTitle",
    "statuteYear",
    "citationPrefix",
    "citationUnit",
    "sections",
  ];
  for (const key of required) {
    if (data[key] === undefined) {
      throw new Error(`${fileName}: missing required field "${key}"`);
    }
  }
  if (!Array.isArray(data.sections) || data.sections.length === 0) {
    throw new Error(`${fileName}: "sections" must be a non-empty array`);
  }
  data.sections.forEach((section, i) => {
    for (const key of ["sectionNumber", "heading", "content"]) {
      if (typeof section[key] !== "string" || section[key].trim() === "") {
        throw new Error(
          `${fileName}: sections[${i}] is missing a valid "${key}"`,
        );
      }
    }
  });
}

function buildCitation(file, sectionNumber) {
  return `${file.citationPrefix} ${file.citationUnit}${sectionNumber}`;
}

function buildEmbeddingInput(statuteTitle, citation, heading, content) {
  return `${statuteTitle}\n${citation} — ${heading}\n\n${content}`;
}

function contentHash(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

async function embedBatch(inputs) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Embedding request failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  const vectors = new Array(inputs.length);
  for (const item of payload.data) {
    vectors[item.index] = item.embedding;
  }
  return vectors;
}

async function ensureSchema() {
  // drizzle-kit push creates the table; these are the search structures it
  // cannot express. An expression index keeps the tsvector derived rather
  // than stored, so text edits can never desynchronise from the index.
  await client.query(`
    CREATE INDEX IF NOT EXISTS statute_sections_fts_idx
      ON statute_sections
      USING GIN (to_tsvector('english', heading || ' ' || content))
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS statute_sections_trgm_idx
      ON statute_sections USING GIN (citation gin_trgm_ops)
  `).catch(() => {
    // pg_trgm may not be installed; citation lookups still work via the
    // btree index created by the Drizzle schema.
  });
}

async function main() {
  await client.connect();
  console.log(`Connected. Embedding model: ${EMBEDDING_MODEL}`);

  await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm").catch(() => {});
  await ensureSchema();

  const files = (await readdir(CORPUS_DIR)).filter((name) =>
    name.endsWith(".json"),
  );
  if (files.length === 0) {
    console.error(`No corpus files found in ${CORPUS_DIR}`);
    process.exit(1);
  }

  const pending = [];
  let totalSections = 0;

  for (const fileName of files) {
    const raw = await readFile(path.join(CORPUS_DIR, fileName), "utf8");
    const file = JSON.parse(raw);
    validateCorpusFile(file, fileName);

    for (const section of file.sections) {
      const citation = buildCitation(file, section.sectionNumber);
      const embeddingInput = buildEmbeddingInput(
        file.statuteTitle,
        citation,
        section.heading,
        section.content,
      );

      const result = await client.query(
        `INSERT INTO statute_sections
           (statute_code, statute_title, statute_year, section_number, citation,
            heading, chapter, content, source_url, verified, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
         ON CONFLICT (statute_code, section_number) DO UPDATE SET
           statute_title = EXCLUDED.statute_title,
           statute_year  = EXCLUDED.statute_year,
           citation      = EXCLUDED.citation,
           heading       = EXCLUDED.heading,
           chapter       = EXCLUDED.chapter,
           content       = EXCLUDED.content,
           source_url    = EXCLUDED.source_url,
           verified      = EXCLUDED.verified,
           updated_at    = now()
         RETURNING id, embedding IS NOT NULL AS has_embedding, embedding_model,
                   embedding_input_hash`,
        [
          file.statuteCode,
          file.statuteTitle,
          file.statuteYear,
          section.sectionNumber,
          citation,
          section.heading,
          section.chapter ?? null,
          section.content,
          file.sourceUrl ?? null,
          // Verification is per provision, not per statute. A file-level flag
          // alone forces an all-or-nothing claim, and that is wrong in both
          // directions: it either marks a provision verified because its
          // neighbours were, or hides seven checked provisions behind one that
          // is not. Constitution Art. 199 is the live example — its text is
          // later than the National Assembly print the other seven were diffed
          // against, so it cannot be confirmed from that source.
          Boolean(section.verified ?? file.verified),
        ],
      );

      const row = result.rows[0];
      totalSections++;

      // Re-embed when the text itself changed, not only when the embedding is
      // missing or the model moved. Without the hash comparison a corrected
      // provision silently kept the vector of the wording it replaced, so
      // fixing the text fixed what a student reads and nothing about what
      // retrieval matches.
      const inputHash = contentHash(embeddingInput);
      const needsEmbedding =
        FORCE ||
        !row.has_embedding ||
        row.embedding_model !== EMBEDDING_MODEL ||
        row.embedding_input_hash !== inputHash;

      if (needsEmbedding) {
        pending.push({
          id: row.id,
          citation,
          input: embeddingInput,
          inputHash,
        });
      }
    }

    // Drop provisions that are no longer in the corpus file. The upsert above
    // can only add or overwrite, so a corrected article number leaves the old
    // row behind and retrieval then serves both — the wrong citation competing
    // with the right one. Renumbering QSO Art. 143 to its correct Art. 148 did
    // exactly that: 22 rows for a 20-provision statute, with the superseded
    // text still citable.
    const { rowCount: pruned } = await client.query(
      `DELETE FROM statute_sections
        WHERE statute_code = $1 AND section_number <> ALL($2::text[])`,
      [file.statuteCode, file.sections.map((section) => section.sectionNumber)],
    );

    console.log(
      `  ${file.statuteCode.padEnd(12)} ${String(file.sections.length).padStart(3)} provisions${file.sections.some((s) => s.verified === false) ? "  (has unverified provisions)" : ""}${pruned > 0 ? `  — pruned ${pruned} stale` : ""}`,
    );
  }

  console.log(
    `\n${totalSections} provisions in corpus, ${pending.length} need embedding.`,
  );

  for (let start = 0; start < pending.length; start += BATCH_SIZE) {
    const batch = pending.slice(start, start + BATCH_SIZE);
    const vectors = await embedBatch(batch.map((item) => item.input));

    for (let i = 0; i < batch.length; i++) {
      await client.query(
        `UPDATE statute_sections
            SET embedding = $1::jsonb, embedding_model = $2,
                embedding_input_hash = $3, updated_at = now()
          WHERE id = $4`,
        [
          JSON.stringify(vectors[i]),
          EMBEDDING_MODEL,
          batch[i].inputHash,
          batch[i].id,
        ],
      );
    }

    console.log(
      `  embedded ${Math.min(start + BATCH_SIZE, pending.length)}/${pending.length}`,
    );
  }

  const { rows: summary } = await client.query(`
    SELECT statute_code,
           count(*)::int AS sections,
           count(embedding)::int AS embedded,
           count(*) FILTER (WHERE verified)::int AS verified
    FROM statute_sections
    GROUP BY statute_code
    ORDER BY statute_code
  `);

  // Counted per provision rather than reduced with bool_and: an instrument with
  // one unchecked article out of eight is not "unverified", and reporting it
  // that way hides seven diffed provisions behind the one still outstanding.
  console.log("\nCorpus state:");
  let unverifiedProvisions = 0;
  for (const row of summary) {
    const outstanding = row.sections - row.verified;
    unverifiedProvisions += outstanding;
    console.log(
      `  ${row.statute_code.padEnd(12)} ${row.embedded}/${row.sections} embedded` +
        `  ${row.verified}/${row.sections} verified${outstanding ? `  ⚠ ${outstanding} outstanding` : ""}`,
    );
  }

  if (unverifiedProvisions > 0) {
    console.log(
      `\n⚠  ${unverifiedProvisions} provision(s) are marked unverified.\n` +
        `   Their text has not been diffed against the official source, so the\n` +
        `   app will label anything retrieved from them as unverified rather\n` +
        `   than presenting it as authoritative law. Verify against\n` +
        `   pakistancode.gov.pk, then set "verified": true on that provision.`,
    );
  }
}

main()
  .catch((err) => {
    console.error("\nIngestion failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
