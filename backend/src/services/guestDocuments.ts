import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { audit } from '@/services/audit';
import { deleteFile } from '@/services/storage';
import { certificateState, licenceState, type CertificateState, type LicenceState } from '@/shared/invitationStates';

/**
 * A guest's hunting licence and training certificate (Schießnachweis): the
 * newest of each, its files, and checking it. Only the newest counts; when the
 * manager checks one, older ones are deleted with their files.
 */

export class DocumentNotFoundError extends Error {
  constructor() { super('Document not found.'); this.name = 'DocumentNotFoundError'; }
}

export type DocumentFile = { key: string; name: string; contentType: string };
export type Licence = { id: number; checked: boolean; checkedAt: string | null; expiryDate: string; uploadedAt: string; files: DocumentFile[] };
export type Certificate = { id: number; checked: boolean; checkedAt: string | null; issueDate: string; uploadedAt: string; files: DocumentFile[] };

type Actor = { userId: number; ip?: string };

export async function guestDocuments(estateId: number, guestId: number, huntDate: string) {
  const licences = await db.execute<{ id: number; checked: boolean; checked_at: string | null; expiry_date: string; upload_date: string; files: DocumentFile[] }>(sql`
    SELECT l.id, l.checked, l.checked_at, to_char(l.expiry_date, 'YYYY-MM-DD') AS expiry_date, l.upload_date,
           COALESCE((SELECT json_agg(json_build_object('key', a.key, 'name', a.original_name, 'contentType', a.content_type) ORDER BY a.id)
                     FROM hunting_license_attachments a WHERE a.license_id = l.id), '[]') AS files
    FROM hunting_licenses l WHERE l.user_id = ${guestId} AND l.estate_id = ${estateId}
    ORDER BY l.upload_date DESC LIMIT 1`);
  const certificates = await db.execute<{ id: number; checked: boolean; checked_at: string | null; issue_date: string; upload_date: string; files: DocumentFile[] }>(sql`
    SELECT t.id, t.checked, t.checked_at, to_char(t.issue_date, 'YYYY-MM-DD') AS issue_date, t.upload_date,
           COALESCE((SELECT json_agg(json_build_object('key', a.key, 'name', a.original_name, 'contentType', a.content_type) ORDER BY a.id)
                     FROM training_certificate_attachments a WHERE a.cert_id = t.id), '[]') AS files
    FROM training_certificates t WHERE t.user_id = ${guestId} AND t.estate_id = ${estateId}
    ORDER BY t.upload_date DESC LIMIT 1`);

  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  const l = licences.rows[0];
  const c = certificates.rows[0];
  const licence: Licence | null = l
    ? { id: l.id, checked: l.checked, checkedAt: iso(l.checked_at), expiryDate: l.expiry_date, uploadedAt: iso(l.upload_date)!, files: l.files }
    : null;
  const certificate: Certificate | null = c
    ? { id: c.id, checked: c.checked, checkedAt: iso(c.checked_at), issueDate: c.issue_date, uploadedAt: iso(c.upload_date)!, files: c.files }
    : null;
  return {
    licence,
    licenceState: licenceState(licence, huntDate) as LicenceState,
    certificate,
    certificateState: certificateState(certificate) as CertificateState,
  };
}

/** Marks a guest's licence as checked; their older licences are deleted with their files. */
export async function checkLicence(estateId: number, guestId: number, licenceId: number, actor?: Actor) {
  const oldKeys = await db.transaction(async (tx) => {
    const found = await tx.execute(sql`
      UPDATE hunting_licenses SET checked = true, checked_at = now()
      WHERE id = ${licenceId} AND user_id = ${guestId} AND estate_id = ${estateId} RETURNING id`);
    if (found.rows.length === 0) throw new DocumentNotFoundError();
    const keys = await tx.execute<{ key: string }>(sql`
      SELECT a.key FROM hunting_license_attachments a JOIN hunting_licenses l ON l.id = a.license_id
      WHERE l.user_id = ${guestId} AND l.estate_id = ${estateId} AND l.id <> ${licenceId}`);
    await tx.execute(sql`DELETE FROM hunting_licenses WHERE user_id = ${guestId} AND estate_id = ${estateId} AND id <> ${licenceId}`);
    return keys.rows.map((r) => r.key);
  });
  // Files are removed after the database change is committed.
  for (const key of oldKeys) await deleteFile(key);
  if (actor) await audit({ ...actor, event: 'license_checked', metadata: { guestId, licenseId: licenceId } });
}

/** Marks a guest's training certificate as checked; their older ones are deleted with their files. */
export async function checkCertificate(estateId: number, guestId: number, certificateId: number, actor?: Actor) {
  const oldKeys = await db.transaction(async (tx) => {
    const found = await tx.execute(sql`
      UPDATE training_certificates SET checked = true, checked_at = now()
      WHERE id = ${certificateId} AND user_id = ${guestId} AND estate_id = ${estateId} RETURNING id`);
    if (found.rows.length === 0) throw new DocumentNotFoundError();
    const keys = await tx.execute<{ key: string }>(sql`
      SELECT a.key FROM training_certificate_attachments a JOIN training_certificates t ON t.id = a.cert_id
      WHERE t.user_id = ${guestId} AND t.estate_id = ${estateId} AND t.id <> ${certificateId}`);
    await tx.execute(sql`DELETE FROM training_certificates WHERE user_id = ${guestId} AND estate_id = ${estateId} AND id <> ${certificateId}`);
    return keys.rows.map((r) => r.key);
  });
  for (const key of oldKeys) await deleteFile(key);
  if (actor) await audit({ ...actor, event: 'certificate_checked', metadata: { guestId, certificateId } });
}
