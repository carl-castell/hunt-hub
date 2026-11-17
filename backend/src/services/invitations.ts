import { randomUUID } from 'crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { audit } from '@/services/audit';
import { EventNotFoundError } from '@/services/events';
import { renderTemplate, sendMail } from '@/services/mail';
import {
  certificateState, licenceState, linkSent,
  type CertificateState, type InvitationResponse, type InvitationStatus, type LicenceState,
} from '@/shared/invitationStates';
import { logger } from '@/utils/logger';

/**
 * Invitations of an event: who is invited, sending and reminding by email,
 * the answers, and whether each guest's documents are in order for the hunt.
 * Every function is scoped to the manager's estate.
 */

type Actor = { userId: number; ip?: string };

export type InvitationRow = {
  id: number;
  publicId: string;
  guest: { id: number; firstName: string; lastName: string; email: string | null; phone: string | null };
  groups: string[];
  status: InvitationStatus;
  response: InvitationResponse;
  respondBy: string | null;
  respondedAt: string | null;
  openedAt: string | null;
  emailSentAt: string | null;
  licence: LicenceState;
  certificate: CertificateState;
};

async function requireEvent(estateId: number, eventId: number) {
  const res = await db.execute<{ id: number; name: string; date: string; estate_name: string }>(sql`
    SELECT e.id, e.event_name AS name, to_char(e.date, 'YYYY-MM-DD') AS date, es.name AS estate_name
    FROM events e JOIN estates es ON es.id = e.estate_id WHERE e.id = ${eventId} AND e.estate_id = ${estateId}`);
  const event = res.rows[0];
  if (!event) throw new EventNotFoundError();
  return event;
}

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

type InvitationDbRow = {
  id: number; public_id: string; status: InvitationStatus; response: InvitationResponse;
  respond_by: unknown; responded_at: unknown; opened_at: unknown; email_sent_at: unknown;
  user_id: number; first_name: string; last_name: string; email: string | null; phone: string | null;
  groups: string[] | null;
  licence: { checked: boolean; expiryDate: string } | null;
  certificate: { checked: boolean } | null;
};
type GuestDbRow = { id: number; first_name: string; last_name: string; email: string; groups: string[] | null };

export async function listInvitations(estateId: number, eventId: number): Promise<InvitationRow[]> {
  const event = await requireEvent(estateId, eventId);
  const res = await db.execute<InvitationDbRow>(sql`
    SELECT i.id, i.public_id, i.status, i.response, i.respond_by, i.responded_at, i.opened_at, i.email_sent_at,
           u.id AS user_id, u.first_name, u.last_name, c.email, c.phone,
           COALESCE((SELECT array_agg(g.name ORDER BY g.name) FROM guest_group_members m
                     JOIN guest_groups g ON g.id = m.group_id WHERE m.user_id = u.id AND g.estate_id = ${estateId}), '{}') AS groups,
           (SELECT json_build_object('checked', l.checked, 'expiryDate', to_char(l.expiry_date, 'YYYY-MM-DD'))
              FROM hunting_licenses l WHERE l.user_id = u.id AND l.estate_id = ${estateId}
              ORDER BY l.upload_date DESC LIMIT 1) AS licence,
           (SELECT json_build_object('checked', t.checked)
              FROM training_certificates t WHERE t.user_id = u.id AND t.estate_id = ${estateId}
              ORDER BY t.upload_date DESC LIMIT 1) AS certificate
    FROM invitations i
    JOIN users u ON u.id = i.user_id
    LEFT JOIN contacts c ON c.user_id = u.id
    WHERE i.event_id = ${eventId}
    ORDER BY u.last_name, u.first_name`);
  return res.rows.map((r) => ({
    id: r.id,
    publicId: r.public_id,
    guest: { id: r.user_id, firstName: r.first_name, lastName: r.last_name, email: r.email ?? null, phone: r.phone ?? null },
    groups: r.groups ?? [],
    status: r.status,
    response: r.response,
    respondBy: iso(r.respond_by),
    respondedAt: iso(r.responded_at),
    openedAt: iso(r.opened_at),
    emailSentAt: iso(r.email_sent_at),
    licence: licenceState(r.licence ?? null, event.date),
    certificate: certificateState(r.certificate ?? null),
  }));
}

const PAGE = 50;

/** A list of ids for `= ANY(...)`; only whole numbers get through. */
const idList = (ids: number[]) => sql.raw(`ARRAY[${ids.map(Number).filter(Number.isInteger).join(',') || 'NULL'}]::int[]`);

/**
 * Guests of the estate that are not invited to this event yet, by name or
 * group name, plus the estate's guest groups with how many of their members
 * could still be invited.
 */
export async function searchGuests(estateId: number, eventId: number, term = '', offset = 0) {
  await requireEvent(estateId, eventId);
  const like = `%${term.trim()}%`;
  const notInvited = sql`u.estate_id = ${estateId}
    AND NOT EXISTS (SELECT 1 FROM invitations i WHERE i.event_id = ${eventId} AND i.user_id = u.id)`;
  const matches = term.trim() ? sql`AND (u.first_name ILIKE ${like} OR u.last_name ILIKE ${like}
    OR EXISTS (SELECT 1 FROM guest_group_members m JOIN guest_groups g ON g.id = m.group_id
               WHERE m.user_id = u.id AND g.name ILIKE ${like}))` : sql``;

  const guests = await db.execute<GuestDbRow>(sql`
    SELECT u.id, u.first_name, u.last_name, c.email,
           COALESCE((SELECT array_agg(g.name ORDER BY g.name) FROM guest_group_members m
                     JOIN guest_groups g ON g.id = m.group_id WHERE m.user_id = u.id), '{}') AS groups
    FROM users u JOIN contacts c ON c.user_id = u.id
    WHERE ${notInvited} ${matches}
    ORDER BY u.last_name, u.first_name LIMIT ${PAGE + 1} OFFSET ${offset}`);

  const groups = await db.execute<{ id: number; name: string; members: number; available: number }>(sql`
    SELECT g.id, g.name, COUNT(m.user_id)::int AS members,
           COUNT(m.user_id) FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM invitations i WHERE i.event_id = ${eventId} AND i.user_id = m.user_id))::int AS available
    FROM guest_groups g LEFT JOIN guest_group_members m ON m.group_id = g.id
    WHERE g.estate_id = ${estateId} ${term.trim() ? sql`AND g.name ILIKE ${like}` : sql``}
    GROUP BY g.id ORDER BY g.name`);

  return {
    guests: guests.rows.slice(0, PAGE).map((r) => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, email: r.email, groups: r.groups ?? [] })),
    hasMore: guests.rows.length > PAGE,
    groups: groups.rows,
  };
}

/** Adds guests (and all members of groups) to the guest list, not sent yet. Returns how many were added. */
export async function stageInvitations(estateId: number, eventId: number, input: { guestIds?: number[]; groupIds?: number[] }) {
  await requireEvent(estateId, eventId);
  const guestIds = input.guestIds ?? [];
  const groupIds = input.groupIds ?? [];
  if (guestIds.length === 0 && groupIds.length === 0) return { added: 0 };
  // Only people of this estate with contact details (guests), never another estate's.
  const candidates = await db.execute<{ id: number }>(sql`
    SELECT DISTINCT u.id FROM users u JOIN contacts c ON c.user_id = u.id
    WHERE u.estate_id = ${estateId} AND (
      u.id = ANY(${idList(guestIds)})
      OR u.id IN (SELECT m.user_id FROM guest_group_members m JOIN guest_groups g ON g.id = m.group_id
                  WHERE g.estate_id = ${estateId} AND g.id = ANY(${idList(groupIds)})))`);
  let added = 0;
  for (const { id } of candidates.rows) {
    const res = await db.execute(sql`
      INSERT INTO invitations (public_id, event_id, user_id, status, response)
      VALUES (${randomUUID()}, ${eventId}, ${id}, 'staged', 'open') ON CONFLICT DO NOTHING RETURNING id`);
    added += res.rows.length;
  }
  return { added };
}

/** Sets status and/or answer of several invitations. Setting an answer records when; "open" clears it. */
export async function updateInvitations(
  estateId: number, eventId: number, ids: number[], change: { status?: InvitationStatus; response?: InvitationResponse },
) {
  await requireEvent(estateId, eventId);
  const res = await db.execute(sql`
    UPDATE invitations SET
      status = COALESCE(${change.status ?? null}::invitation_status, status),
      response = COALESCE(${change.response ?? null}::invitation_response, response),
      responded_at = CASE
        WHEN ${change.response ?? null}::text IS NULL THEN responded_at
        WHEN ${change.response ?? null}::text = 'open' THEN NULL
        ELSE COALESCE(responded_at, now()) END
    WHERE event_id = ${eventId} AND id = ANY(${idList(ids)}) RETURNING id`);
  return { updated: res.rows.length };
}

/** Removes invitations. Returns how many had a sent link (those links stop working). */
export async function removeInvitations(estateId: number, eventId: number, ids: number[]) {
  await requireEvent(estateId, eventId);
  const res = await db.execute<{ status: InvitationStatus }>(sql`
    DELETE FROM invitations WHERE event_id = ${eventId} AND id = ANY(${idList(ids)}) RETURNING status`);
  return { removed: res.rows.length, sentLinks: res.rows.filter((r) => linkSent(r.status)).length };
}

// ── Emails ──────────────────────────────────────────────────────────────────

export type EmailKind = 'invitation' | 'reminder';

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * The manager's message as safe HTML: placeholders filled with the guest's
 * name, everything escaped (names and message are plain text), line breaks kept.
 */
export function personalMessage(message: string, guest: { firstName: string; lastName: string }): string {
  return escapeHtml(message)
    .replace(/\{\{\s*firstName\s*\}\}/g, escapeHtml(guest.firstName))
    .replace(/\{\{\s*lastName\s*\}\}/g, escapeHtml(guest.lastName))
    .replace(/\r?\n/g, '<br>');
}

const subjectOf = (kind: EmailKind, eventName: string) =>
  kind === 'reminder' ? `Reminder: invitation – ${eventName}` : `Invitation – ${eventName}`;

function renderEmail(kind: EmailKind, message: string, guest: { firstName: string; lastName: string }, eventName: string, rsvpUrl: string) {
  return renderTemplate('invitation', {
    message: personalMessage(message, guest),
    eventName,
    year: new Date().getFullYear(),
    rsvpUrl,
    reminder: kind === 'reminder',
  });
}

/** The email as an example guest would get it (for the preview). */
export async function previewEmail(estateId: number, eventId: number, kind: EmailKind, message: string, baseUrl: string) {
  const event = await requireEvent(estateId, eventId);
  return {
    subject: subjectOf(kind, event.name),
    html: await renderEmail(kind, message, { firstName: 'Max', lastName: 'Mustermann' }, event.name, `${baseUrl}/rsvp/preview/${eventId}`),
  };
}

export type SendResult = {
  sent: { id: number; name: string }[];
  failed: { id: number; name: string; reason: string }[];
  skipped: number;
};

const PARALLEL_EMAILS = 4;

/**
 * Sends invitations (to guests not sent yet) or reminders (to guests whose
 * link was sent and who haven't answered yet; the link stays the same).
 * Emails go out a few at a time; each guest's result is reported.
 */
export async function sendEmails(
  estateId: number, eventId: number,
  input: { kind: EmailKind; invitationIds: number[]; message: string; respondBy?: string | null },
  context: { baseUrl: string; actor?: Actor },
): Promise<SendResult> {
  const event = await requireEvent(estateId, eventId);
  const wanted = input.kind === 'reminder'
    ? sql`i.status IN ('sent_email', 'sent_manually') AND i.response = 'open'`
    : sql`i.status = 'staged'`;
  const rows = await db.execute<{ id: number; public_id: string; first_name: string; last_name: string; email: string | null }>(sql`
    SELECT i.id, i.public_id, u.first_name, u.last_name, c.email
    FROM invitations i JOIN users u ON u.id = i.user_id LEFT JOIN contacts c ON c.user_id = u.id
    WHERE i.event_id = ${eventId} AND i.id = ANY(${idList(input.invitationIds)}) AND ${wanted}
    ORDER BY u.last_name, u.first_name`);

  const result: SendResult = { sent: [], failed: [], skipped: input.invitationIds.length - rows.rows.length };
  const queue = [...rows.rows];
  const worker = async () => {
    for (let row = queue.shift(); row; row = queue.shift()) {
      const name = `${row.first_name} ${row.last_name}`;
      if (!row.email) {
        result.failed.push({ id: row.id, name, reason: 'No email address' });
        continue;
      }
      try {
        const html = await renderEmail(input.kind, input.message, { firstName: row.first_name, lastName: row.last_name },
          event.name, `${context.baseUrl}/rsvp/${row.public_id}`);
        await sendMail({ to: row.email, subject: subjectOf(input.kind, event.name), html, fromName: event.estate_name || undefined });
        await db.execute(input.kind === 'reminder'
          ? sql`UPDATE invitations SET respond_by = COALESCE(${input.respondBy ?? null}::timestamp, respond_by) WHERE id = ${row.id}`
          : sql`UPDATE invitations SET status = 'sent_email', email_sent_at = now(),
                  respond_by = COALESCE(${input.respondBy ?? null}::timestamp, respond_by) WHERE id = ${row.id}`);
        result.sent.push({ id: row.id, name });
      } catch (err) {
        // No email address in the log: the invitation id is enough to find it.
        logger.warn({ err, invitationId: row.id }, '[invite] Failed to send email');
        result.failed.push({ id: row.id, name, reason: 'The email could not be sent' });
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL_EMAILS }, worker));

  if (context.actor) {
    await audit({
      ...context.actor,
      event: input.kind === 'reminder' ? 'invitation_reminder_sent' : 'invitation_email_sent',
      metadata: { eventId, sentCount: result.sent.length, failedCount: result.failed.length },
    });
  }
  return result;
}
