import { index, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// Request counters of the rate limiters (see middlewares/postgresRateLimitStore.ts).
// Kept in the database instead of in memory, so every app instance counts the
// same attempts and the limits hold when more than one instance runs.
export const rateLimitsTable = pgTable("rate_limits", {
  key: varchar({ length: 255 }).primaryKey(),
  hits: integer().notNull(),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
}, (t) => [
  index('idx_rate_limits_reset_at').on(t.resetAt),
]);
