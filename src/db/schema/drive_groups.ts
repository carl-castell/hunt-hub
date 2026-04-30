import { relations } from "drizzle-orm";
import { index, integer, pgTable } from "drizzle-orm/pg-core";
import { drivesTable } from "./drives";
import { usersTable } from "./users";
import { driveStandAssignmentsTable } from "./drive_stand_assignments";

export const driveGroupsTable = pgTable("drive_groups", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  driveId: integer("drive_id").notNull().references(() => drivesTable.id, { onDelete: "cascade" }),
  leaderId: integer("leader_id").references(() => usersTable.id, { onDelete: "set null" }),
  number: integer().notNull(),
}, (t) => [
  index('idx_drive_groups_drive_id').on(t.driveId),
]);

export const driveGroupsRelations = relations(driveGroupsTable, ({ one, many }) => ({
  drive: one(drivesTable, {
    fields: [driveGroupsTable.driveId],
    references: [drivesTable.id],
  }),
  leader: one(usersTable, {
    fields: [driveGroupsTable.leaderId],
    references: [usersTable.id],
  }),
  standAssignments: many(driveStandAssignmentsTable), // ← was missing
}));
