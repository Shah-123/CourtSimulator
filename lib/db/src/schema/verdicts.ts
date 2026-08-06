import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sessionsTable } from "./sessions";

/** One statutory citation a student made, checked against the corpus. */
export const citationCheckSchema = z.object({
  /** The citation exactly as the student said it. */
  raw: z.string(),
  /** Canonical form once resolved, or null if it could not be resolved. */
  citation: z.string().nullable(),
  status: z.enum(["verified", "not_found", "uncovered"]),
  heading: z.string().nullable(),
});

export type VerdictCitationCheck = z.infer<typeof citationCheckSchema>;

export const verdictsTable = pgTable("verdicts", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessionsTable.id)
    .unique(),
  winningSide: text("winning_side").notNull(),
  overallScore: integer("overall_score").notNull(),
  legalReasoningScore: integer("legal_reasoning_score").notNull(),
  persuasivenessScore: integer("persuasiveness_score").notNull(),
  procedureScore: integer("procedure_score").notNull(),
  factualCommandScore: integer("factual_command_score").notNull(),
  /**
   * Percentage of the student's statutory citations that resolve to a real
   * provision. Computed deterministically from the corpus, not scored by the
   * model, so it is the one number in this table that cannot be hallucinated.
   * Null when the student cited no statutes at all.
   */
  citationAccuracy: integer("citation_accuracy"),
  citationChecks: jsonb("citation_checks")
    .$type<VerdictCitationCheck[]>()
    .notNull()
    .default([]),
  judgeRemarks: text("judge_remarks").notNull(),
  strengths: text("strengths").notNull(),
  areasForImprovement: text("areas_for_improvement").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertVerdictSchema = createInsertSchema(verdictsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertVerdict = z.infer<typeof insertVerdictSchema>;
export type Verdict = typeof verdictsTable.$inferSelect;
