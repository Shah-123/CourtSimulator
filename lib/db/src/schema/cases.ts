import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const witnessSchema = z.object({
  name: z.string(),
  role: z.string(),
  statement: z.string(),
});

export type Witness = z.infer<typeof witnessSchema>;

/**
 * A provision the case is grounded in, resolved against the statute corpus
 * at generation time. Unlike the free-text `applicableLaws` string, every
 * entry here has been confirmed to exist.
 */
export const statuteCitationSchema = z.object({
  citation: z.string(),
  statuteCode: z.string(),
  heading: z.string(),
  /** Whether the corpus text was diffed against the official source. */
  verified: z.boolean(),
});

export type StatuteCitation = z.infer<typeof statuteCitationSchema>;

export const casesTable = pgTable("cases", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  areaOfLaw: text("area_of_law").notNull(),
  difficulty: text("difficulty").notNull(),
  summary: text("summary").notNull(),
  applicableLaws: text("applicable_laws").notNull(),
  petitionerName: text("petitioner_name").notNull(),
  petitionerRole: text("petitioner_role").notNull(),
  respondentName: text("respondent_name").notNull(),
  respondentRole: text("respondent_role").notNull(),
  witnesses: jsonb("witnesses").$type<Witness[]>().notNull().default([]),
  /**
   * Provisions resolved against the statute corpus. `applicableLaws` stays as
   * the human-readable string the UI shows; this is the machine-checked list
   * behind it.
   */
  citations: jsonb("citations")
    .$type<StatuteCitation[]>()
    .notNull()
    .default([]),
  source: text("source").notNull().default("library"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertCaseSchema = createInsertSchema(casesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Case = typeof casesTable.$inferSelect;
