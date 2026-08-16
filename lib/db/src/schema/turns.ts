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
 * One recorded step of an agent's reasoning before it spoke.
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
  // Carried by the bench and by the witness, and null for anyone else. For the
  // bench these are the Thought-Action-Observation steps of its tool loop; for
  // the witness it is the one line recording what in its own statement let it
  // answer, or why it could not. Absence means "this turn had no reasoning to
  // show", never "the reasoning was lost".
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
