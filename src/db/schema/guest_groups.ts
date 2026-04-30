import { index, integer, pgTable, unique, varchar } from 'drizzle-orm/pg-core';
import { estatesTable } from './estates';
import { usersTable } from './users';

export const guestGroupsTable = pgTable('guest_groups', {
  id:       integer().primaryKey().generatedAlwaysAsIdentity(),
  name:     varchar('name', { length: 255 }).notNull(),
  estateId: integer('estate_id').notNull().references(() => estatesTable.id, { onDelete: 'cascade' }),
}, (t) => [
  index('idx_guest_groups_estate_id').on(t.estateId),
  index('idx_guest_groups_name_trgm').using('gin', t.name.op('gin_trgm_ops')),
]);

export const guestGroupMembersTable = pgTable('guest_group_members', {
  id:      integer().primaryKey().generatedAlwaysAsIdentity(),
  groupId: integer('group_id').notNull().references(() => guestGroupsTable.id, { onDelete: 'cascade' }),
  userId:  integer('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
}, t => [
  unique().on(t.groupId, t.userId),
  index('idx_ggm_group_id').on(t.groupId),
  index('idx_ggm_user_id').on(t.userId),
]);
