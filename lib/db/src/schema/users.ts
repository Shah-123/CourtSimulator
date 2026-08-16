import {
  pgTable,
  text,
  serial,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * A student, and the owner of every session they argue.
 *
 * Sessions carry a mark and a judge's written assessment of a named person's
 * advocacy. Before this table the dashboard aggregated every session in the
 * database and the history page listed them all, so any student could read any
 * other student's verdict — which is what kept the app out of a classroom
 * rather than any missing feature.
 */
export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),

    /**
     * Lowercased and trimmed at the API boundary before it reaches here. The
     * unique index is over the stored value, so normalising anywhere later than
     * the boundary would let "A@uni.edu.pk" and "a@uni.edu.pk" both register and
     * then race for the same login.
     */
    email: text("email").notNull(),

    /** Name shown on the record of proceedings, e.g. "Ayesha Khan". */
    displayName: text("display_name").notNull(),

    /**
     * scrypt digest in the form `scrypt$N$r$p$salt$key`, all base64.
     *
     * The parameters are stored beside the digest rather than read from config
     * at verify time: raising the cost for new passwords must not lock out every
     * account hashed under the old one, and a digest that does not carry its own
     * parameters cannot be verified after they change.
     *
     * Never selected into a response. Routes list columns explicitly rather than
     * `select()` for this reason.
     */
    passwordHash: text("password_hash").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

/** A user as the API is allowed to describe them. Deliberately no hash. */
export type PublicUser = Pick<User, "id" | "email" | "displayName">;
