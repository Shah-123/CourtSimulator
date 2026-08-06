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

/**
 * One Thought-Action-Observation step of the judge's ReAct loop.
 *
 * Mirrors `CourtReasoningStep` in the OpenAPI contract. The AI service already
 * returns these on every ruling, but they lived only in the turn response — so
 * the reasoning behind a ruling vanished the moment the page reloaded. A
 * courtroom record that cannot show why the bench ruled is not a record.
 */
export interface ReasoningStep {
  thought: string;
  action: string;
  observation: string;
}

export const turnsTable = pgTable("turns", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessionsTable.id),
  phase: text("phase").notNull(),
  speaker: text("speaker").notNull(),
  witnessName: text("witness_name"),
  transcript: text("transcript").notNull(),
  // Null for every speaker but the bench, and for rulings made without the
  // tool loop. Absence means "this turn had no reasoning to show", never
  // "the reasoning was lost".
  reasoning: jsonb("reasoning").$type<ReasoningStep[]>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertTurnSchema = createInsertSchema(turnsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTurn = z.infer<typeof insertTurnSchema>;
export type Turn = typeof turnsTable.$inferSelect;
