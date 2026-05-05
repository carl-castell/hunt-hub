import { relations } from "drizzle-orm";
import { index, integer, pgTable } from "drizzle-orm/pg-core";
import { templatesTable } from "./templates";
import { templateGroupsTable } from "./template_groups";
import { standsTable } from "./stands";

export const templateStandAssignmentsTable = pgTable("template_stand_assignments", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  templateId: integer("template_id").notNull().references(() => templatesTable.id, { onDelete: "cascade" }),
  standId: integer("stand_id").notNull().references(() => standsTable.id, { onDelete: "cascade" }),
  templateGroupId: integer("template_group_id").references(() => templateGroupsTable.id, { onDelete: "set null" }), // nullable — stand may not be in a group
}, (t) => [
  index('idx_tsa_template_id').on(t.templateId),
  index('idx_tsa_stand_id').on(t.standId),
]);

export const templateStandAssignmentsRelations = relations(templateStandAssignmentsTable, ({ one }) => ({
  template: one(templatesTable, {
    fields: [templateStandAssignmentsTable.templateId],
    references: [templatesTable.id],
  }),
  stand: one(standsTable, {
    fields: [templateStandAssignmentsTable.standId],
    references: [standsTable.id],
  }),
  templateGroup: one(templateGroupsTable, {
    fields: [templateStandAssignmentsTable.templateGroupId],
    references: [templateGroupsTable.id],
  }),
}));
