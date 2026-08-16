import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * A single retrievable unit of Pakistani statute law: one section of an Act,
 * one Article of an Order, or one Article of the Constitution.
 *
 * Statutes are chunked on their own structural boundaries rather than by a
 * fixed token window. Legal provisions are self-contained by design, so a
 * section is already the unit a lawyer cites and the unit a judge reasons
 * about. This keeps every retrieved chunk independently quotable.
 *
 * Embeddings are stored as jsonb rather than a pgvector column because the
 * corpus is small enough (low thousands of sections) that exact cosine over
 * an in-memory matrix beats an approximate index, and it keeps the project
 * runnable on a stock PostgreSQL install with no extensions.
 */
export const statuteSectionsTable = pgTable(
  "statute_sections",
  {
    id: serial("id").primaryKey(),

    /** Stable machine key for the instrument, e.g. "PPC_1860", "QSO_1984". */
    statuteCode: text("statute_code").notNull(),
    /** Full formal name, e.g. "Pakistan Penal Code, 1860". */
    statuteTitle: text("statute_title").notNull(),
    /** Year of enactment, used for recency and amendment filtering. */
    statuteYear: integer("statute_year").notNull(),

    /** Bare provision number as printed, e.g. "302", "17", "199". */
    sectionNumber: text("section_number").notNull(),
    /**
     * Canonical citation string the AI is required to reproduce verbatim,
     * e.g. "PPC 1860 s.302" or "QSO 1984 Art. 17". Citation verification
     * matches against this exact form.
     */
    citation: text("citation").notNull(),
    /** Marginal note / provision heading, e.g. "Punishment of qatl-i-amd". */
    heading: text("heading").notNull(),
    /** Parent chapter or part, when the instrument has one. */
    chapter: text("chapter"),

    /** The operative text of the provision. */
    content: text("content").notNull(),

    /** Embedding of `heading + content`. Null until the ingest job runs. */
    embedding: jsonb("embedding").$type<number[]>(),
    /** Which embedding model produced `embedding`, for safe re-indexing. */
    embeddingModel: text("embedding_model"),
    /**
     * Hash of the exact text that was embedded.
     *
     * Without it the ingest cannot tell that a provision's wording changed: it
     * only knew whether *an* embedding existed and which model made it, so a
     * corrected provision kept the vector of the text it replaced. Correcting
     * PPC s.375 from the repealed definition to the current one changed nothing
     * about what retrieval matched until this was recorded.
     */
    embeddingInputHash: text("embedding_input_hash"),

    /** Authoritative source the text was taken from. */
    sourceUrl: text("source_url"),
    /**
     * True only once the text has been diffed against the official source by
     * `pnpm run statutes:verify`. Unverified provisions are still retrievable
     * but are surfaced to the user with a provenance warning, so the system
     * never silently presents unchecked text as authoritative law.
     */
    verified: boolean("verified").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("statute_sections_code_number_idx").on(
      table.statuteCode,
      table.sectionNumber,
    ),
    index("statute_sections_citation_idx").on(table.citation),
  ],
);

export const insertStatuteSectionSchema = createInsertSchema(
  statuteSectionsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertStatuteSection = z.infer<typeof insertStatuteSectionSchema>;
export type StatuteSection = typeof statuteSectionsTable.$inferSelect;

/** Shape of the corpus files under `data/statutes/*.json`. */
export const statuteCorpusFileSchema = z.object({
  statuteCode: z.string(),
  statuteTitle: z.string(),
  statuteYear: z.number().int(),
  citationPrefix: z.string(),
  citationUnit: z.enum(["s.", "Art. "]),
  sourceUrl: z.string(),
  /**
   * Default verification state for provisions that do not declare their own.
   *
   * Verification is decided one provision at a time — a diff against the
   * official text either matches or it does not — but it was only recordable
   * per instrument, so two provisions that still differed dragged the thirteen
   * already diffed clean in the same file down to ⚠ with them. Files written
   * before per-provision flags existed carry no section-level value, and this
   * remains their answer, so nothing changes until a provision is marked
   * individually.
   */
  verified: z.boolean().default(false),
  sections: z
    .array(
      z.object({
        sectionNumber: z.string(),
        heading: z.string(),
        chapter: z.string().nullable().default(null),
        content: z.string(),
        /**
         * This provision's own verification state, overriding the
         * instrument-level default above. Set it only after diffing this
         * provision against the official source; absent means "inherit", not
         * "unverified".
         */
        verified: z.boolean().optional(),
      }),
    )
    .min(1),
});

export type StatuteCorpusFile = z.infer<typeof statuteCorpusFileSchema>;
