import { index, pgTable, integer, varchar, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { usersTable } from './users';

export const totpBackupCodesTable = pgTable('totp_backup_codes', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  codeHash: varchar('code_hash', { length: 64 }).notNull(),
  usedAt: timestamp('used_at'),
}, (t) => [
  index('idx_totp_backup_codes_user_id').on(t.userId),
]);

export const totpBackupCodesRelations = relations(totpBackupCodesTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [totpBackupCodesTable.userId],
    references: [usersTable.id],
  }),
}));
