import { index, integer, pgTable, varchar, customType, timestamp } from "drizzle-orm/pg-core";
import { relations } from 'drizzle-orm';
import { estatesTable } from "./estates";
import { standsTable } from "./stands";

const geometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(MultiPolygon, 4326)';
  },
});

export const areasTable = pgTable("areas", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  estateId: integer('estate_id').notNull().references(() => estatesTable.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  geofile: geometry('geofile'),
  // Bumped by a DB trigger on every UPDATE (migration 0011); used for mobile sync.
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_areas_estate_id').on(t.estateId),
]);

export const areasRelations = relations(areasTable, ({ one, many }) => ({
  estate: one(estatesTable, {
    fields: [areasTable.estateId],
    references: [estatesTable.id],
  }),
  stands: many(standsTable),
}));
