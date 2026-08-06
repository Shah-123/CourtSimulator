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
import { casesTable } from "./cases";

/**
 * The long-term memory an agent carries between courtroom phases.
 *
 * Kept structured rather than as a prose summary because the individual
 * fields are queried directly: `studentClaims` is what a contradiction check
 * compares a new assertion against, and a flat narrative would make that
 * comparison lossy.
 */
export const sessionMemorySchema = z.object({
  /** Narrative of what has happened so far, for general context. */
  summary: z.string(),
  /** Factual and legal assertions the student has committed to on the record. */
  studentClaims: z.array(z.string()),
  /** Key points of testimony given by witnesses. */
  witnessTestimony: z.array(z.string()),
  /** Directions and warnings the bench has issued. */
  judgeDirections: z.array(z.string()),
});

export type SessionMemory = z.infer<typeof sessionMemorySchema>;

export const EMPTY_SESSION_MEMORY: SessionMemory = {
  summary: "",
  studentClaims: [],
  witnessTestimony: [],
  judgeDirections: [],
};

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id")
    .notNull()
    .references(() => casesTable.id),
  studentSide: text("student_side").notNull(),
  phase: text("phase").notNull().default("opening"),
  status: text("status").notNull().default("in_progress"),
  /** Rolling long-term memory. Null until the first phase completes. */
  memory: jsonb("memory").$type<SessionMemory>(),
  /**
   * Highest turn id already folded into `memory`. Summarisation runs on phase
   * transitions rather than every turn, and this watermark is what makes that
   * incremental instead of re-reading the whole transcript each time.
   */
  memoryThroughTurnId: integer("memory_through_turn_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;
