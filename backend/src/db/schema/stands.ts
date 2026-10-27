import { relations } from "drizzle-orm";
import { customType, index, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

const geometryPoint4326 = customType<{ data: string; driverData: string }>({
  dataType() { return 'geometry(Point, 4326)'; },
});
import { areasTable } from "./areas";
import { templateStandAssignmentsTable } from "./template_stand_assignments";
import { driveStandAssignmentsTable } from "./drive_stand_assignments";

export const standsTable = pgTable("stands", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  number: varchar().notNull(),
  areaId: integer("area_id").notNull().references(() => areasTable.id, { onDelete: "cascade" }),
  location: geometryPoint4326('location'),
  // Bumped by a DB trigger on every UPDATE (migration 0011); used for mobile sync.
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_stands_area_id').on(t.areaId),
]);

export const standsRelations = relations(standsTable, ({ many, one }) => ({
  area: one(areasTable, {
    fields: [standsTable.areaId],
    references: [areasTable.id],
  }),
  templateAssignments: many(templateStandAssignmentsTable),
  driveAssignments: many(driveStandAssignmentsTable),
}));
