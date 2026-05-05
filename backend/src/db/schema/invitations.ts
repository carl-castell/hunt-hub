import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { eventsTable } from "./events";
import { usersTable } from "./users";
import { userAuthTokensTable } from "./user_auth_tokens";

export const invitationResponseEnum = pgEnum("invitation_response", [
  "open",
  "yes",
  "no",
]);

export const invitationStatusEnum = pgEnum("invitation_status", [
  "staged",
  "sent_email",
  "sent_manually",
  "waitlist",
  "archived",
]);

export const invitationsTable = pgTable(
  "invitations",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),

    publicId: uuid("public_id").notNull(), // add unique below; optionally defaultRandom()

    eventId: integer("event_id")
      .notNull()
      .references(() => eventsTable.id, { onDelete: "cascade" }),

    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),

    tokenId: integer("token_id")
      .references(() => userAuthTokensTable.id, { onDelete: "cascade" }),

    response: invitationResponseEnum().notNull().default("open"),
    respondBy: timestamp("respond_by"),
    respondedAt: timestamp("responded_at"),
    openedAt: timestamp("opened_at"),

    status: invitationStatusEnum().notNull().default("staged"),

    emailSentAt: timestamp("email_sent_at"),
  },
  (t) => [
    unique("uniq_invitations_public_id").on(t.publicId),
    unique("uniq_invitations_event_user").on(t.eventId, t.userId),
    unique("uniq_invitations_token_id").on(t.tokenId),
    check("responded_at_required_if_response_not_open", sql`${t.response} = 'open' OR ${t.respondedAt} IS NOT NULL`),
    check("responded_at_must_be_null_if_open", sql`${t.response} != 'open' OR ${t.respondedAt} IS NULL`),
    index('idx_invitations_event_status').on(t.eventId, t.status),
    index('idx_invitations_user_id').on(t.userId),
  ]
);

export const invitationsRelations = relations(invitationsTable, ({ one }) => ({
  event: one(eventsTable, {
    fields: [invitationsTable.eventId],
    references: [eventsTable.id],
  }),
  user: one(usersTable, {
    fields: [invitationsTable.userId],
    references: [usersTable.id],
  }),
  token: one(userAuthTokensTable, {
    fields: [invitationsTable.tokenId],
    references: [userAuthTokensTable.id],
  }),
}));
