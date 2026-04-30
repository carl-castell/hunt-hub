import { index, integer, pgTable, varchar, customType } from "drizzle-orm/pg-core";
import { relations } from 'drizzle-orm';
import { estatesTable } from "./estates";
import { standsTable } from "./stands";

const geometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(GeometryCollection, 4326)';
  },
});

export const areasTable = pgTable("areas", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  estateId: integer('estate_id').notNull().references(() => estatesTable.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  geofile: geometry('geofile'),
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
