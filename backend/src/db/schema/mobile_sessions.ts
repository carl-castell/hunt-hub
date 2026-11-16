import { index, integer, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { usersTable } from "./users";

// Long-lived device sessions for the mobile app (Bearer token auth).
// Tokens are stored as SHA-256 hashes; the raw tokens only live on the device.
export const mobileSessionsTable = pgTable("mobile_sessions", {
  id: uuid().primaryKey().defaultRandom(),
  userId: integer('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  deviceName: varchar('device_name', { length: 255 }),
  accessTokenHash: varchar('access_token_hash', { length: 64 }).notNull().unique(),
  accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }).notNull(),
  refreshTokenHash: varchar('refresh_token_hash', { length: 64 }).notNull().unique(),
  // The previous refresh token stays valid until the new pair is used once,
  // so a refresh response lost on a bad connection doesn't log the user out.
  prevRefreshTokenHash: varchar('prev_refresh_token_hash', { length: 64 }).unique(),
  refreshExpiresAt: timestamp('refresh_expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => [
  index('idx_mobile_sessions_user_id').on(t.userId),
]);

export const mobileSessionsRelations = relations(mobileSessionsTable, ({ one }) => ({
  user: one(usersTable, { fields: [mobileSessionsTable.userId], references: [usersTable.id] }),
}));
