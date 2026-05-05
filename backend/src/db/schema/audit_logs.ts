import { relations } from 'drizzle-orm';
import { index, pgTable, integer, timestamp, varchar, json } from 'drizzle-orm/pg-core';
import { usersTable } from './users';

export const auditLogsTable = pgTable('audit_logs', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer('user_id').references(() => usersTable.id, { onDelete: 'set null' }),
  event: varchar('event', { length: 100 }).notNull(),
  ip: varchar('ip', { length: 255 }),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  index('idx_audit_logs_user_id').on(t.userId),
  index('idx_audit_logs_created_at').on(t.createdAt),
]);


export const auditLogsRelations = relations(auditLogsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [auditLogsTable.userId],
    references: [usersTable.id],
  }),
}));

