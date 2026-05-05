import { integer, pgTable, varchar, date } from "drizzle-orm/pg-core";
import { relations } from 'drizzle-orm';
import { usersTable } from "./users";

export const contactsTable = pgTable("contacts", {
  userId: integer('user_id').primaryKey().references(() => usersTable.id, { onDelete: 'cascade' }),
  email: varchar({ length: 255 }).notNull(),
  phone: varchar({ length: 255 }),
  dateOfBirth: date('date_of_birth'),
  rating: integer(),
});

export const contactsRelations = relations(contactsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [contactsTable.userId],
    references: [usersTable.id],
  }),
}));
