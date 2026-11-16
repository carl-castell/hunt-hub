import { bigint, index, integer, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Filled by AFTER DELETE triggers on areas/stands (see migration 0011),
// so mobile clients can learn about hard deletes when pulling deltas.
export const syncTombstonesTable = pgTable("sync_tombstones", {
  id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  entity: varchar({ length: 32 }).notNull(),
  entityId: integer('entity_id').notNull(),
  estateId: integer('estate_id').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_sync_tombstones_estate_deleted').on(t.estateId, t.deletedAt),
]);

// One row per mutation pushed by a client. The client-generated id makes
// pushes idempotent: a retried mutation returns its stored result.
export const syncMutationsTable = pgTable("sync_mutations", {
  id: uuid().primaryKey(),
  userId: integer('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  type: varchar({ length: 64 }).notNull(),
  status: varchar({ length: 16 }).notNull(),
  result: jsonb(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});
