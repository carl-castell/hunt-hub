import { index, integer, pgTable, varchar, date, time } from "drizzle-orm/pg-core";
import { relations } from 'drizzle-orm';
import { estatesTable } from "./estates";
import { invitationsTable } from "./invitations";
import { drivesTable } from "./drives";




export const eventsTable = pgTable("events", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  estateId: integer('estate_id').notNull().references(() => estatesTable.id, { onDelete: 'cascade' }),
  eventName: varchar('event_name',{ length: 255 }).notNull(),
  date: date().notNull(),
  time: time().notNull(),
}, (t) => [
  index('idx_events_estate_id').on(t.estateId),
]);

export const eventsRelations = relations(eventsTable, ({ one, many }) => ({
  estate: one(estatesTable, {
    fields: [eventsTable.estateId],
    references: [estatesTable.id],
  }),
  invitations: many(invitationsTable),
  drives: many(drivesTable),
}));