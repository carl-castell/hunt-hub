import { relations } from "drizzle-orm";
import { index, integer, pgTable } from "drizzle-orm/pg-core";
import { drivesTable } from "./drives";
import { driveGroupsTable } from "./drive_groups";
import { standsTable } from "./stands";
import { usersTable } from "./users";

export const driveStandAssignmentsTable = pgTable("drive_stand_assignments", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  driveId: integer("drive_id").notNull().references(() => drivesTable.id, { onDelete: "cascade" }),
  standId: integer("stand_id").notNull().references(() => standsTable.id, { onDelete: "cascade" }),
  driveGroupId: integer("drive_group_id").references(() => driveGroupsTable.id, { onDelete: "set null" }), // nullable — stand may not be in a group
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }), // nullable — stand may not have a user
}, (t) => [
  index('idx_dsa_drive_id').on(t.driveId),
  index('idx_dsa_drive_group_id').on(t.driveGroupId),
  index('idx_dsa_user_id').on(t.userId),
]);

export const driveStandAssignmentsRelations = relations(driveStandAssignmentsTable, ({ one }) => ({
  drive: one(drivesTable, {
    fields: [driveStandAssignmentsTable.driveId],
    references: [drivesTable.id],
  }),
  stand: one(standsTable, {
    fields: [driveStandAssignmentsTable.standId],
    references: [standsTable.id],
  }),
  driveGroup: one(driveGroupsTable, {
    fields: [driveStandAssignmentsTable.driveGroupId],
    references: [driveGroupsTable.id],
  }),
  user: one(usersTable, {
    fields: [driveStandAssignmentsTable.userId],
    references: [usersTable.id],
  }),
}));
