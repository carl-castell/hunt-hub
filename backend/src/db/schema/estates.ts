import { integer, pgTable, varchar } from "drizzle-orm/pg-core";
import { relations } from 'drizzle-orm';
import { usersTable } from "./users";
import { eventsTable } from "./events";
import { areasTable } from "./areas";
import { templatesTable } from "./templates";

export const estatesTable = pgTable('estates', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 256 }).notNull(),
});

export const estatesRelations = relations(estatesTable, ({ many }) => ({
  users: many(usersTable),
  events: many(eventsTable),
  areas: many(areasTable),
  templates: many(templatesTable),
}));
