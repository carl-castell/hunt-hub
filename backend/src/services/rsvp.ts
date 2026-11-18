import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { DocumentRejectedError, guestDocuments, storeDocument, type UploadedFile } from '@/services/guestDocuments';
import { todayInGermany } from '@/services/stands';
import { durationBetween } from '@/shared/driveTimes';
import type { CertificateState, InvitationResponse, LicenceState } from '@/shared/invitationStates';

/**
 * The guest's answer page (RSVP). The guest has no account: the invitation's
 * public id in their link is the only key, so every function starts from it
 * and only ever touches that one guest's data.
 */

export class InvitationNotFoundError extends Error {
  constructor() { super('This invitation link is not valid (any more).'); this.name = 'InvitationNotFoundError'; }
}
export class RsvpClosedError extends Error {
  constructor(message: string) { super(message); this.name = 'RsvpClosedError'; }
}
/** Upload problems (wrong file, impossible date) come from the documents service. */
export { DocumentRejectedError as UploadRejectedError };

/** Why a guest can't answer (any more); null if they can. */
export type ClosedReason = 'not_sent' | 'deadline' | 'past' | 'archived' | null;

export type RsvpView = {
  guest: { firstName: string; lastName: string };
  event: { name: string; date: string; start: string; estate: string; drives: { name: string; start: string; end: string; durationMinutes: number }[] };
  response: InvitationResponse;
  respondBy: string | null;
  closed: ClosedReason;
  licence: { state: LicenceState; expiryDate: string | null; rejectedBecause: string | null };
  certificate: { state: CertificateState; issueDate: string | null; rejectedBecause: string | null };
  contact: { phone: string | null; dateOfBirth: string | null };
};

type InvitationRow = {
  id: number; user_id: number; estate_id: number; status: string; response: InvitationResponse;
  respond_by: string | null; first_name: string; last_name: string;
  event_id: number; event_name: string; date: string; start: string; estate: string;
};

async function findInvitation(publicId: string): Promise<InvitationRow> {
  // Only well-formed ids reach the database (the link could be anything).
  if (!/^[0-9a-f-]{36}$/i.test(publicId)) throw new InvitationNotFoundError();
  const res = await db.execute<InvitationRow>(sql`
    SELECT i.id, i.user_id, e.estate_id, i.status, i.response, i.respond_by, u.first_name, u.last_name,
           e.id AS event_id, e.event_name, to_char(e.date, 'YYYY-MM-DD') AS date, to_char(e.time, 'HH24:MI') AS start, es.name AS estate
    FROM invitations i JOIN users u ON u.id = i.user_id JOIN events e ON e.id = i.event_id JOIN estates es ON es.id = e.estate_id
    WHERE i.public_id = ${publicId}`);
  const row = res.rows[0];
  if (!row) throw new InvitationNotFoundError();
  return row;
}

/**
 * Whether the guest may answer: the invitation must have been sent (an
 * archived one is closed), the hunt must not be over, and the answer-by date
 * must not have passed.
 */
export function closedReason(
  invitation: { status: string; respond_by: string | null; date: string }, now = new Date(), today = todayInGermany(now),
): ClosedReason {
  if (invitation.status === 'staged') return 'not_sent';
  if (invitation.status === 'archived') return 'archived';
  if (invitation.date < today) return 'past';
  // The answer-by date is a day: answers are possible until the end of it.
  if (invitation.respond_by && new Date(invitation.respond_by).toISOString().slice(0, 10) < today) return 'deadline';
  return null;
}

const CLOSED_MESSAGES: Record<Exclude<ClosedReason, null>, string> = {
  not_sent: 'This invitation has not been sent yet.',
  archived: 'This invitation is no longer open.',
  past: 'This hunt is over.',
  deadline: 'The date to answer has passed. Please contact the estate directly.',
};

async function drivesOf(eventId: number) {
  const res = await db.execute<{ name: string; start: string; end: string }>(sql`
    SELECT name, to_char(start_time, 'HH24:MI') AS start, to_char(end_time, 'HH24:MI') AS "end"
    FROM drives WHERE event_id = ${eventId} ORDER BY start_time, id`);
  return res.rows.map((d) => ({ ...d, durationMinutes: durationBetween(d.start, d.end) }));
}

/** Everything the answer page shows. The first visit is recorded (the manager sees "opened"). */
export async function rsvpView(publicId: string): Promise<RsvpView> {
  const inv = await findInvitation(publicId);
  await db.execute(sql`UPDATE invitations SET opened_at = now() WHERE id = ${inv.id} AND opened_at IS NULL`);
  const [drives, documents, contact] = await Promise.all([
    drivesOf(inv.event_id),
    guestDocuments(inv.estate_id, inv.user_id, inv.date),
    db.execute<{ phone: string | null; date_of_birth: string | null }>(sql`
      SELECT phone, to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth FROM contacts WHERE user_id = ${inv.user_id}`),
  ]);
  return {
    guest: { firstName: inv.first_name, lastName: inv.last_name },
    event: { name: inv.event_name, date: inv.date, start: inv.start, estate: inv.estate, drives },
    response: inv.response,
    respondBy: inv.respond_by ? new Date(inv.respond_by).toISOString() : null,
    closed: closedReason(inv),
    licence: { state: documents.licenceState, expiryDate: documents.licence?.expiryDate ?? null, rejectedBecause: documents.licenceRejection?.reason ?? null },
    certificate: { state: documents.certificateState, issueDate: documents.certificate?.issueDate ?? null, rejectedBecause: documents.certificateRejection?.reason ?? null },
    contact: { phone: contact.rows[0]?.phone ?? null, dateOfBirth: contact.rows[0]?.date_of_birth ?? null },
  };
}

/** The guest's answer. It can be changed until the answer-by date. */
export async function respond(publicId: string, answer: 'yes' | 'no') {
  const inv = await findInvitation(publicId);
  const closed = closedReason(inv);
  if (closed) throw new RsvpClosedError(CLOSED_MESSAGES[closed]);
  await db.execute(sql`UPDATE invitations SET response = ${answer}, responded_at = now() WHERE id = ${inv.id}`);
}

/** Documents and contact details only make sense from a guest who is coming. */
async function comingGuest(publicId: string) {
  const inv = await findInvitation(publicId);
  if (inv.response !== 'yes') throw new RsvpClosedError('Please answer "I’m coming" first.');
  if (closedReason(inv) === 'past') throw new RsvpClosedError(CLOSED_MESSAGES.past);
  return inv;
}

// ── Uploads ─────────────────────────────────────────────────────────────────

export { MAX_DOCUMENT_BYTES, type UploadedFile } from '@/services/guestDocuments';

/** A new hunting licence (to be checked by the manager). The expiry date must not be in the past. */
export async function uploadLicence(publicId: string, input: { expiryDate: string; files: UploadedFile[] }) {
  const inv = await comingGuest(publicId);
  await storeDocument(inv.estate_id, inv.user_id, 'licence', input.expiryDate, input.files, false);
}

/** A new training certificate (to be checked by the manager). The issue date must not be in the future. */
export async function uploadCertificate(publicId: string, input: { issueDate: string; files: UploadedFile[] }) {
  const inv = await comingGuest(publicId);
  await storeDocument(inv.estate_id, inv.user_id, 'certificate', input.issueDate, input.files, false);
}

/** Phone and date of birth; empty fields are left as they are. */
export async function saveDetails(publicId: string, input: { phone?: string | null; dateOfBirth?: string | null }) {
  const inv = await comingGuest(publicId);
  await db.execute(sql`
    UPDATE contacts SET phone = COALESCE(${input.phone || null}, phone),
                        date_of_birth = COALESCE(${input.dateOfBirth || null}::date, date_of_birth)
    WHERE user_id = ${inv.user_id}`);
}

// ── The manager's preview ───────────────────────────────────────────────────

/** The answer page as an example guest sees it, for the manager's preview. Nothing is saved. */
export async function previewView(estateId: number, eventId: number): Promise<RsvpView> {
  const res = await db.execute<{ name: string; date: string; start: string; estate: string }>(sql`
    SELECT e.event_name AS name, to_char(e.date, 'YYYY-MM-DD') AS date, to_char(e.time, 'HH24:MI') AS start, es.name AS estate
    FROM events e JOIN estates es ON es.id = e.estate_id WHERE e.id = ${eventId} AND e.estate_id = ${estateId}`);
  const event = res.rows[0];
  if (!event) throw new InvitationNotFoundError();
  return {
    guest: { firstName: 'Max', lastName: 'Mustermann' },
    event: { ...event, drives: await drivesOf(eventId) },
    response: 'open',
    respondBy: null,
    closed: null,
    licence: { state: 'missing', expiryDate: null, rejectedBecause: null },
    certificate: { state: 'missing', issueDate: null, rejectedBecause: null },
    contact: { phone: null, dateOfBirth: null },
  };
}
