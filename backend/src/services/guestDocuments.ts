import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { audit } from '@/services/audit';
import { renderTemplate, sendMail } from '@/services/mail';
import { todayInGermany } from '@/services/stands';
import { deleteFile, uploadFile } from '@/services/storage';
import { certificateState, licenceState, type CertificateState, type LicenceState } from '@/shared/invitationStates';
import { logger } from '@/utils/logger';

/**
 * A guest's hunting licence and training certificate (Schießnachweis): the
 * newest of each with its files, and everything the manager does with them:
 * confirm (with a corrected date), reject with a reason, upload for the
 * guest, delete. Only the newest counts; once one is confirmed, older ones are
 * deleted with their files. Every function is scoped to the manager's estate.
 */

export class DocumentNotFoundError extends Error {
  constructor() { super('Document not found.'); this.name = 'DocumentNotFoundError'; }
}
export class DocumentRejectedError extends Error {
  constructor(message: string) { super(message); this.name = 'DocumentRejectedError'; }
}

export type DocumentKind = 'licence' | 'certificate';
export type DocumentFile = { key: string; name: string; contentType: string };
export type Licence = { id: number; checked: boolean; checkedAt: string | null; expiryDate: string; uploadedAt: string; files: DocumentFile[] };
export type Certificate = { id: number; checked: boolean; checkedAt: string | null; issueDate: string; uploadedAt: string; files: DocumentFile[] };
export type Rejection = { reason: string; rejectedAt: string };

type Actor = { userId: number; ip?: string };
type Executor = Pick<typeof db, 'execute'>;

/** The tables of each kind of document. */
const TABLES = {
  licence: { docs: sql.raw('hunting_licenses'), files: sql.raw('hunting_license_attachments'), fk: sql.raw('license_id'), date: sql.raw('expiry_date'), prefix: 'licenses/hunting' },
  certificate: { docs: sql.raw('training_certificates'), files: sql.raw('training_certificate_attachments'), fk: sql.raw('cert_id'), date: sql.raw('issue_date'), prefix: 'certificates' },
} as const;

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

async function newest(kind: DocumentKind, estateId: number, guestId: number) {
  const t = TABLES[kind];
  const res = await db.execute<{ id: number; checked: boolean; checked_at: string | null; date: string; upload_date: string; files: DocumentFile[] }>(sql`
    SELECT d.id, d.checked, d.checked_at, to_char(d.${t.date}, 'YYYY-MM-DD') AS date, d.upload_date,
           COALESCE((SELECT json_agg(json_build_object('key', a.key, 'name', a.original_name, 'contentType', a.content_type) ORDER BY a.id)
                     FROM ${t.files} a WHERE a.${t.fk} = d.id), '[]') AS files
    FROM ${t.docs} d WHERE d.user_id = ${guestId} AND d.estate_id = ${estateId}
    ORDER BY d.upload_date DESC, d.id DESC LIMIT 1`);
  const r = res.rows[0];
  return r ? { id: r.id, checked: r.checked, checkedAt: iso(r.checked_at), date: r.date, uploadedAt: iso(r.upload_date)!, files: r.files } : null;
}

async function lastRejection(kind: DocumentKind, estateId: number, guestId: number): Promise<Rejection | null> {
  const res = await db.execute<{ reason: string; rejected_at: string }>(sql`
    SELECT reason, rejected_at FROM document_rejections
    WHERE user_id = ${guestId} AND estate_id = ${estateId} AND kind = ${kind}
    ORDER BY rejected_at DESC LIMIT 1`);
  const r = res.rows[0];
  return r ? { reason: r.reason, rejectedAt: iso(r.rejected_at)! } : null;
}

/**
 * The guest's documents and their state. With a hunt date, the licence is
 * judged for that day (expires before the hunt?); without one, for today.
 */
export async function guestDocuments(estateId: number, guestId: number, huntDate: string = todayInGermany()) {
  const [l, c, licenceRejection, certificateRejection] = await Promise.all([
    newest('licence', estateId, guestId), newest('certificate', estateId, guestId),
    lastRejection('licence', estateId, guestId), lastRejection('certificate', estateId, guestId),
  ]);
  const licence: Licence | null = l ? { id: l.id, checked: l.checked, checkedAt: l.checkedAt, expiryDate: l.date, uploadedAt: l.uploadedAt, files: l.files } : null;
  const certificate: Certificate | null = c ? { id: c.id, checked: c.checked, checkedAt: c.checkedAt, issueDate: c.date, uploadedAt: c.uploadedAt, files: c.files } : null;
  const licenceStateNow: LicenceState = licenceState(licence, huntDate, licenceRejection);
  const certificateStateNow: CertificateState = certificateState(certificate, certificateRejection);
  return {
    licence,
    licenceState: licenceStateNow,
    licenceRejection: licenceStateNow === 'rejected' ? licenceRejection : null,
    certificate,
    certificateState: certificateStateNow,
    certificateRejection: certificateStateNow === 'rejected' ? certificateRejection : null,
  };
}

/** The guest of this estate (name and date of birth, to compare with the document). */
export async function guestOfEstate(estateId: number, guestId: number) {
  const res = await db.execute<{ id: number; first_name: string; last_name: string; date_of_birth: string | null; email: string | null }>(sql`
    SELECT u.id, u.first_name, u.last_name, to_char(c.date_of_birth, 'YYYY-MM-DD') AS date_of_birth, c.email
    FROM users u JOIN contacts c ON c.user_id = u.id WHERE u.id = ${guestId} AND u.estate_id = ${estateId}`);
  const r = res.rows[0];
  if (!r) throw new DocumentNotFoundError();
  return { id: r.id, firstName: r.first_name, lastName: r.last_name, dateOfBirth: r.date_of_birth, email: r.email };
}

function checkDate(kind: DocumentKind, date: string, today = todayInGermany()) {
  if (kind === 'licence' && date < today) throw new DocumentRejectedError('This licence has expired: the expiry date is in the past.');
  if (kind === 'certificate' && date > today) throw new DocumentRejectedError('The issue date can’t be in the future.');
}

/** Deletes the guest's documents of this kind except one, with their files. Run inside a transaction; returns the file keys to delete afterwards. */
async function removeOthers(tx: Executor, kind: DocumentKind, estateId: number, guestId: number, keepId: number): Promise<string[]> {
  const t = TABLES[kind];
  const keys = await tx.execute<{ key: string }>(sql`
    SELECT a.key FROM ${t.files} a JOIN ${t.docs} d ON d.id = a.${t.fk}
    WHERE d.user_id = ${guestId} AND d.estate_id = ${estateId} AND d.id <> ${keepId}`);
  await tx.execute(sql`DELETE FROM ${t.docs} WHERE user_id = ${guestId} AND estate_id = ${estateId} AND id <> ${keepId}`);
  return keys.rows.map((r) => r.key);
}

/**
 * Confirms a document: optionally with a corrected date (as read from the
 * document), then marked as checked; older documents of the guest go.
 */
export async function confirmDocument(estateId: number, guestId: number, kind: DocumentKind, documentId: number, correctedDate?: string, actor?: Actor) {
  if (correctedDate) checkDate(kind, correctedDate);
  const t = TABLES[kind];
  const oldKeys = await db.transaction(async (tx) => {
    const found = await tx.execute(sql`
      UPDATE ${t.docs} SET checked = true, checked_at = now()
        ${correctedDate ? sql`, ${t.date} = ${correctedDate}` : sql``}
      WHERE id = ${documentId} AND user_id = ${guestId} AND estate_id = ${estateId} RETURNING id`);
    if (found.rows.length === 0) throw new DocumentNotFoundError();
    return removeOthers(tx, kind, estateId, guestId, documentId);
  });
  // Files are removed after the database change is committed.
  for (const key of oldKeys) await deleteFile(key);
  if (actor) await audit({ ...actor, event: kind === 'licence' ? 'license_checked' : 'certificate_checked', metadata: { guestId, documentId, correctedDate: correctedDate ?? null } });
}

/** Shortcuts used by the earlier pages. */
export const checkLicence = (estateId: number, guestId: number, id: number, actor?: Actor) => confirmDocument(estateId, guestId, 'licence', id, undefined, actor);
export const checkCertificate = (estateId: number, guestId: number, id: number, actor?: Actor) => confirmDocument(estateId, guestId, 'certificate', id, undefined, actor);

/** Deletes one document with its files. */
export async function deleteDocument(estateId: number, guestId: number, kind: DocumentKind, documentId: number, actor?: Actor) {
  const t = TABLES[kind];
  const keys = await db.transaction(async (tx) => {
    const files = await tx.execute<{ key: string }>(sql`
      SELECT a.key FROM ${t.files} a JOIN ${t.docs} d ON d.id = a.${t.fk}
      WHERE d.id = ${documentId} AND d.user_id = ${guestId} AND d.estate_id = ${estateId}`);
    const res = await tx.execute(sql`DELETE FROM ${t.docs} WHERE id = ${documentId} AND user_id = ${guestId} AND estate_id = ${estateId} RETURNING id`);
    if (res.rows.length === 0) throw new DocumentNotFoundError();
    return files.rows.map((r) => r.key);
  });
  for (const key of keys) await deleteFile(key);
  if (actor) await audit({ ...actor, event: kind === 'licence' ? 'license_deleted' : 'certificate_deleted', metadata: { guestId, documentId } });
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * The invitation link the guest can upload a new document with: the given
 * hunt's, otherwise the guest's next hunt whose invitation went out.
 */
async function answerLink(estateId: number, guestId: number, eventId?: number) {
  const res = await db.execute<{ public_id: string; event_name: string; estate: string }>(sql`
    SELECT i.public_id, e.event_name, es.name AS estate
    FROM invitations i JOIN events e ON e.id = i.event_id JOIN estates es ON es.id = e.estate_id
    WHERE i.user_id = ${guestId} AND e.estate_id = ${estateId}
      AND ${eventId ? sql`e.id = ${eventId}` : sql`e.date >= ${todayInGermany()}::date AND i.status IN ('sent_email', 'sent_manually')`}
    ORDER BY e.date LIMIT 1`);
  return res.rows[0] ?? null;
}

/**
 * Rejects a document with a reason: it is deleted with its files, the reason
 * is kept (the guest list shows "rejected", the answer page says why), and the
 * guest is emailed with the link to upload a new one, if they have an open
 * invitation. Returns whether the email went out.
 */
export async function rejectDocument(
  estateId: number, guestId: number, kind: DocumentKind, documentId: number, reason: string,
  context: { baseUrl: string; eventId?: number; actor?: Actor },
): Promise<{ emailed: boolean }> {
  const guest = await guestOfEstate(estateId, guestId);
  await deleteDocument(estateId, guestId, kind, documentId);
  await db.execute(sql`INSERT INTO document_rejections (estate_id, user_id, kind, reason) VALUES (${estateId}, ${guestId}, ${kind}, ${reason})`);
  if (context.actor) await audit({ ...context.actor, event: 'document_rejected', metadata: { guestId, kind, documentId } });

  const link = guest.email ? await answerLink(estateId, guestId, context.eventId) : null;
  if (!link || !guest.email) return { emailed: false };
  const what = kind === 'licence' ? 'hunting licence' : 'training certificate';
  const message = `Hello ${escapeHtml(guest.firstName)},<br><br>unfortunately we can't accept the ${what} you uploaded: ${escapeHtml(reason)}<br><br>Please upload it again on your answer page.`;
  try {
    const html = await renderTemplate('invitation', {
      message, eventName: link.event_name, year: new Date().getFullYear(), rsvpUrl: `${context.baseUrl}/rsvp/${link.public_id}`,
    });
    await sendMail({ to: guest.email, subject: `Please upload your ${what} again – ${link.event_name}`, html, fromName: link.estate || undefined });
    return { emailed: true };
  } catch (err) {
    logger.warn({ err, guestId }, '[documents] Failed to send the rejection email');
    return { emailed: false };
  }
}

// ── Uploads (by the guest on the answer page, or by the manager for the guest) ──

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const PDF_TYPE = 'application/pdf';
export const MAX_DOCUMENT_BYTES = 10_000_000;

export type UploadedFile = { name: string; type: string; size: number; bytes: Buffer };

function safeFilename(name: string): string {
  let decoded: string;
  try { decoded = decodeURIComponent(name); } catch { decoded = name; }
  return decoded.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '_');
}

/** One PDF, or up to `maxImages` photos (JPEG, PNG, WEBP, HEIC), each at most 10 MB. */
export function checkFiles(files: UploadedFile[], maxImages: number) {
  if (files.length === 0) throw new DocumentRejectedError('Please choose a file.');
  if (files.some((f) => f.size > MAX_DOCUMENT_BYTES)) throw new DocumentRejectedError('Each file can be at most 10 MB.');
  const onePdf = files.length === 1 && files[0].type === PDF_TYPE;
  const images = files.every((f) => IMAGE_TYPES.includes(f.type));
  if (!onePdf && !images) throw new DocumentRejectedError('Upload one PDF or photos (JPEG, PNG, WEBP, HEIC).');
  if (images && files.length > maxImages) throw new DocumentRejectedError(`At most ${maxImages} photos.`);
}

/**
 * Stores a new document with its files. `checked`: uploaded by the manager
 * (who has seen the original), so it counts as checked and replaces older ones.
 */
export async function storeDocument(
  estateId: number, guestId: number, kind: DocumentKind, date: string, files: UploadedFile[], checked: boolean,
): Promise<number> {
  checkDate(kind, date);
  checkFiles(files, kind === 'licence' ? 4 : 2);
  const t = TABLES[kind];
  const res = await db.execute<{ id: number }>(sql`
    INSERT INTO ${t.docs} (user_id, estate_id, ${t.date}, checked, checked_at)
    VALUES (${guestId}, ${estateId}, ${date}, ${checked}, ${checked ? sql`now()` : null}) RETURNING id`);
  const id = res.rows[0].id;
  for (const file of files) {
    const key = `${t.prefix}/${id}/${safeFilename(file.name)}`;
    await uploadFile(key, file.bytes, file.type);
    await db.execute(sql`
      INSERT INTO ${t.files} (${t.fk}, kind, key, content_type, original_name, size_bytes)
      VALUES (${id}, ${file.type === PDF_TYPE ? 'document' : 'photo'}, ${key}, ${file.type}, ${file.name}, ${file.size})`);
  }
  if (checked) {
    const oldKeys = await db.transaction((tx) => removeOthers(tx, kind, estateId, guestId, id));
    for (const key of oldKeys) await deleteFile(key);
  }
  return id;
}

/** The manager uploads a document for the guest (e.g. they showed the paper one): checked at once. */
export async function uploadForGuest(estateId: number, guestId: number, kind: DocumentKind, date: string, files: UploadedFile[], actor?: Actor) {
  await guestOfEstate(estateId, guestId);
  const id = await storeDocument(estateId, guestId, kind, date, files, true);
  if (actor) await audit({ ...actor, event: kind === 'licence' ? 'license_uploaded' : 'certificate_uploaded', metadata: { guestId, documentId: id, byManager: true } });
  return { id };
}
