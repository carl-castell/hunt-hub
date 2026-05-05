import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  date,
  text,
  index,
} from "drizzle-orm/pg-core";
import { estatesTable } from "./estates";
import { usersTable } from "./users";

// ─── Shared attachment columns ───────────────────────────────────────────────

export const attachmentKind = pgEnum("attachment_kind", ["photo", "document"]);

const attachmentColumns = {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  kind: attachmentKind("kind").notNull(),
  key: text("key").notNull(),
  contentType: text("content_type").notNull(),
  originalName: text("original_name").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadDate: timestamp("upload_date").notNull().defaultNow(),
};

// ─── Hunting Licenses ─────────────────────────────────────────────────────────

export const huntingLicensesTable = pgTable(
  "hunting_licenses",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    estateId: integer("estate_id").notNull().references(() => estatesTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    checked: boolean().notNull().default(false),
    checkedAt: timestamp("checked_at"),
    expiryDate: date("expiry_date").notNull(),
    uploadDate: timestamp("upload_date").notNull().defaultNow(),
  },
  (t) => [
    index("idx_hunting_licenses_estate_id").on(t.estateId),
    index("idx_hunting_licenses_user_id").on(t.userId),
    index("idx_hunting_licenses_expiry_date").on(t.expiryDate),
  ]
);

export const huntingLicenseAttachmentsTable = pgTable(
  "hunting_license_attachments",
  {
    ...attachmentColumns,
    licenseId: integer("license_id")
      .notNull()
      .references(() => huntingLicensesTable.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("idx_hl_attachments_license_id").on(t.licenseId),
    index("idx_hl_attachments_kind").on(t.licenseId, t.kind),
    index("idx_hl_attachments_key").on(t.key),
  ]
);

// ─── Training Certificates ────────────────────────────────────────────────────

export const trainingCertificatesTable = pgTable(
  "training_certificates",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    estateId: integer("estate_id").notNull().references(() => estatesTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    checked: boolean().notNull().default(false),
    checkedAt: timestamp("checked_at"),
    issueDate: date("issue_date").notNull(),
    uploadDate: timestamp("upload_date").notNull().defaultNow(),
  },
  (t) => [
    index("idx_training_certificates_estate_id").on(t.estateId),
    index("idx_training_certificates_user_id").on(t.userId),
    index("idx_training_certificates_issue_date").on(t.issueDate),
  ]
);

export const trainingCertificateAttachmentsTable = pgTable(
  "training_certificate_attachments",
  {
    ...attachmentColumns,
    certId: integer("cert_id")
      .notNull()
      .references(() => trainingCertificatesTable.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("idx_tc_attachments_cert_id").on(t.certId),
    index("idx_tc_attachments_kind").on(t.certId, t.kind),
    index("idx_tc_attachments_key").on(t.key),
  ]
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const huntingLicensesRelations = relations(
  huntingLicensesTable,
  ({ one, many }) => ({
    estate: one(estatesTable, {
      fields: [huntingLicensesTable.estateId],
      references: [estatesTable.id],
    }),
    user: one(usersTable, {
      fields: [huntingLicensesTable.userId],
      references: [usersTable.id],
    }),
    attachments: many(huntingLicenseAttachmentsTable),
  })
);

export const huntingLicenseAttachmentsRelations = relations(
  huntingLicenseAttachmentsTable,
  ({ one }) => ({
    license: one(huntingLicensesTable, {
      fields: [huntingLicenseAttachmentsTable.licenseId],
      references: [huntingLicensesTable.id],
    }),
  })
);

export const trainingCertificatesRelations = relations(
  trainingCertificatesTable,
  ({ one, many }) => ({
    estate: one(estatesTable, {
      fields: [trainingCertificatesTable.estateId],
      references: [estatesTable.id],
    }),
    user: one(usersTable, {
      fields: [trainingCertificatesTable.userId],
      references: [usersTable.id],
    }),
    attachments: many(trainingCertificateAttachmentsTable),
  })
);

export const trainingCertificateAttachmentsRelations = relations(
  trainingCertificateAttachmentsTable,
  ({ one }) => ({
    certificate: one(trainingCertificatesTable, {
      fields: [trainingCertificateAttachmentsTable.certId],
      references: [trainingCertificatesTable.id],
    }),
  })
);
