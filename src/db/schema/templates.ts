import { relations } from "drizzle-orm";
import { index, integer, pgTable, varchar } from "drizzle-orm/pg-core";
import { estatesTable } from "./estates";
import { templateGroupsTable } from "./template_groups";

export const templatesTable = pgTable("templates", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  estateId: integer("estate_id").notNull().references(() => estatesTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
}, (t) => [
  index('idx_templates_estate_id').on(t.estateId),
]);

export const templatesRelations = relations(templatesTable, ({ one, many }) => ({
  estate: one(estatesTable, {
    fields: [templatesTable.estateId],
    references: [estatesTable.id],
  }),
  groups: many(templateGroupsTable),
}));
