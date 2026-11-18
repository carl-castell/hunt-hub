import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { audit } from '@/services/audit';
import { todayInGermany } from '@/services/stands';
import {
  DEFAULT_DRIVE_MINUTES, DEFAULT_FIRST_DRIVE_START, durationBetween, endOf, fitsInDay, minutesOf, nextDriveName, nextFullHourAfter,
} from '@/shared/driveTimes';

/**
 * Hunting events (Drückjagd etc.) and their drives, for the React manager area
 * and the server-rendered pages. Every function is scoped to the manager's
 * estate. An event always has at least one drive; the event's start time is
 * the start of its first drive.
 */

export class EventNotFoundError extends Error {
  constructor() { super('Event not found.'); this.name = 'EventNotFoundError'; }
}
export class DriveNotFoundError extends Error {
  constructor() { super('Drive not found.'); this.name = 'DriveNotFoundError'; }
}
export class DriveRuleError extends Error {
  constructor(message: string) { super(message); this.name = 'DriveRuleError'; }
}

type Executor = Pick<typeof db, 'execute'>;
type Actor = { userId: number; ip?: string };

export type GuestCounts = { invited: number; yes: number; no: number; open: number; notSent: number };
export type Drive = { id: number; name: string; start: string; end: string; durationMinutes: number };
export type EventSummary = {
  id: number; name: string; date: string; start: string; drives: number; guests: GuestCounts;
};
export type EventDetails = EventSummary & {
  driveList: Drive[];
  /** Where the time picker of the next drive starts. */
  nextDriveStart: string;
  /** Invitations whose link was already sent: deleting the event breaks them. */
  sentLinks: number;
};

// Same rules as guestFilters() in shared/invitationStates.ts: archived invitations don't count;
// "not sent" = the invitation hasn't gone out (also while on the waiting list).
const COUNTS = sql`
  COUNT(i.id) FILTER (WHERE i.status <> 'archived')::int AS invited,
  COUNT(i.id) FILTER (WHERE i.status <> 'archived' AND i.response = 'yes')::int AS yes,
  COUNT(i.id) FILTER (WHERE i.status <> 'archived' AND i.response = 'no')::int AS no,
  COUNT(i.id) FILTER (WHERE i.status <> 'archived' AND i.response = 'open'
                        AND (i.email_sent_at IS NOT NULL OR i.status = 'sent_manually'))::int AS open,
  COUNT(i.id) FILTER (WHERE i.status <> 'archived' AND i.email_sent_at IS NULL AND i.status <> 'sent_manually')::int AS not_sent,
  COUNT(i.id) FILTER (WHERE i.status IN ('sent_email', 'sent_manually'))::int AS sent_links`;

type EventRow = {
  id: number; name: string; date: string; start: string; drives: number;
  invited: number; yes: number; no: number; open: number; not_sent: number; sent_links: number;
};

const toSummary = (r: EventRow): EventSummary => ({
  id: r.id, name: r.name, date: r.date, start: r.start.slice(0, 5), drives: r.drives,
  guests: { invited: r.invited, yes: r.yes, no: r.no, open: r.open, notSent: r.not_sent },
});

async function eventRows(executor: Executor, estateId: number, eventId?: number): Promise<EventRow[]> {
  const res = await executor.execute<EventRow>(sql`
    SELECT e.id, e.event_name AS name, to_char(e.date, 'YYYY-MM-DD') AS date, to_char(e.time, 'HH24:MI') AS start,
           (SELECT COUNT(*)::int FROM drives d WHERE d.event_id = e.id) AS drives,
           ${COUNTS}
    FROM events e LEFT JOIN invitations i ON i.event_id = e.id
    WHERE e.estate_id = ${estateId} ${eventId === undefined ? sql`` : sql`AND e.id = ${eventId}`}
    GROUP BY e.id`);
  return res.rows;
}

/** Upcoming events (today included) soonest first, past events latest first. */
export async function listEvents(estateId: number, today = todayInGermany()) {
  const rows = (await eventRows(db, estateId)).map(toSummary);
  const byDate = (a: EventSummary, b: EventSummary) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start);
  return {
    upcoming: rows.filter((e) => e.date >= today).sort(byDate),
    past: rows.filter((e) => e.date < today).sort((a, b) => byDate(b, a)),
  };
}

async function driveList(executor: Executor, eventId: number): Promise<Drive[]> {
  const res = await executor.execute<{ id: number; name: string; start: string; end: string }>(sql`
    SELECT id, name, to_char(start_time, 'HH24:MI') AS start, to_char(end_time, 'HH24:MI') AS "end"
    FROM drives WHERE event_id = ${eventId} ORDER BY start_time, id`);
  return res.rows.map((d) => ({ ...d, durationMinutes: durationBetween(d.start, d.end) }));
}

export async function getEvent(estateId: number, eventId: number): Promise<EventDetails> {
  const [row] = await eventRows(db, estateId, eventId);
  if (!row) throw new EventNotFoundError();
  const drives = await driveList(db, eventId);
  const last = drives[drives.length - 1];
  return {
    ...toSummary(row),
    driveList: drives,
    nextDriveStart: last ? nextFullHourAfter(last.end) : DEFAULT_FIRST_DRIVE_START,
    sentLinks: row.sent_links,
  };
}

/** The first drive of the estate's most recent event: its start and length are the defaults for the next event. */
async function lastFirstDrive(executor: Executor, estateId: number): Promise<{ start: string; durationMinutes: number }> {
  const res = await executor.execute<{ start: string; end: string }>(sql`
    SELECT to_char(d.start_time, 'HH24:MI') AS start, to_char(d.end_time, 'HH24:MI') AS "end"
    FROM events e JOIN drives d ON d.event_id = e.id
    WHERE e.estate_id = ${estateId}
    ORDER BY e.id DESC, d.start_time, d.id LIMIT 1`);
  const row = res.rows[0];
  return row
    ? { start: row.start, durationMinutes: durationBetween(row.start, row.end) }
    : { start: DEFAULT_FIRST_DRIVE_START, durationMinutes: DEFAULT_DRIVE_MINUTES };
}

/** The start time a new event will get (for the form). */
export async function defaultEventStart(estateId: number): Promise<string> {
  return (await lastFirstDrive(db, estateId)).start;
}

/**
 * A new event with "Drive 1". Unless a start is given, Drive 1 starts (and
 * lasts) like the first drive of the estate's last event.
 */
export async function createEvent(
  estateId: number, input: { name: string; date: string; start?: string }, actor?: Actor,
): Promise<{ id: number }> {
  const id = await db.transaction(async (tx) => {
    const last = await lastFirstDrive(tx, estateId);
    const first = input.start && fitsInDay(input.start, last.durationMinutes)
      ? { ...last, start: input.start }
      : input.start ? { start: input.start, durationMinutes: Math.min(DEFAULT_DRIVE_MINUTES, 24 * 60 - minutesOf(input.start)) } : last;
    const res = await tx.execute<{ id: number }>(sql`
      INSERT INTO events (estate_id, event_name, date, time) VALUES (${estateId}, ${input.name}, ${input.date}, ${first.start})
      RETURNING id`);
    const eventId = res.rows[0].id;
    await tx.execute(sql`
      INSERT INTO drives (event_id, name, start_time, end_time)
      VALUES (${eventId}, 'Drive 1', ${first.start}, ${endOf(first.start, first.durationMinutes)})`);
    return eventId;
  });
  if (actor) await audit({ ...actor, event: 'event_created', metadata: { eventId: id } });
  return { id };
}

export async function updateEvent(estateId: number, eventId: number, input: { name: string; date: string }, actor?: Actor) {
  const res = await db.execute(sql`
    UPDATE events SET event_name = ${input.name}, date = ${input.date}
    WHERE id = ${eventId} AND estate_id = ${estateId} RETURNING id`);
  if (res.rows.length === 0) throw new EventNotFoundError();
  if (actor) await audit({ ...actor, event: 'event_updated', metadata: { eventId } });
}

/** Deletes the event with its drives and invitations (their links stop working). */
export async function deleteEvent(estateId: number, eventId: number, actor?: Actor) {
  const res = await db.execute(sql`DELETE FROM events WHERE id = ${eventId} AND estate_id = ${estateId} RETURNING id`);
  if (res.rows.length === 0) throw new EventNotFoundError();
  if (actor) await audit({ ...actor, event: 'event_deleted', metadata: { eventId } });
}

// ── Drives ──────────────────────────────────────────────────────────────────

async function requireEvent(executor: Executor, estateId: number, eventId: number) {
  const res = await executor.execute(sql`SELECT id FROM events WHERE id = ${eventId} AND estate_id = ${estateId} FOR UPDATE`);
  if (res.rows.length === 0) throw new EventNotFoundError();
}

/** The event starts when its first drive starts. */
async function syncEventStart(executor: Executor, eventId: number) {
  await executor.execute(sql`
    UPDATE events SET time = (SELECT MIN(start_time) FROM drives WHERE event_id = ${eventId})
    WHERE id = ${eventId} AND EXISTS (SELECT 1 FROM drives WHERE event_id = ${eventId})`);
}

function checkTimes(start: string, durationMinutes: number) {
  if (!fitsInDay(start, durationMinutes)) {
    throw new DriveRuleError('A drive must last at least 15 minutes and end before midnight.');
  }
}

export async function createDrive(
  estateId: number, eventId: number, input: { name?: string; start: string; durationMinutes: number },
): Promise<{ id: number; name: string }> {
  checkTimes(input.start, input.durationMinutes);
  return db.transaction(async (tx) => {
    await requireEvent(tx, estateId, eventId);
    const existing = await driveList(tx, eventId);
    const name = input.name?.trim() || nextDriveName(existing.map((d) => d.name));
    const res = await tx.execute<{ id: number }>(sql`
      INSERT INTO drives (event_id, name, start_time, end_time)
      VALUES (${eventId}, ${name}, ${input.start}, ${endOf(input.start, input.durationMinutes)}) RETURNING id`);
    await syncEventStart(tx, eventId);
    return { id: res.rows[0].id, name };
  });
}

export async function updateDrive(
  estateId: number, driveId: number, input: { name?: string; start?: string; durationMinutes?: number },
) {
  await db.transaction(async (tx) => {
    const res = await tx.execute<{ event_id: number; name: string; start: string; end: string }>(sql`
      SELECT d.event_id, d.name, to_char(d.start_time, 'HH24:MI') AS start, to_char(d.end_time, 'HH24:MI') AS "end"
      FROM drives d JOIN events e ON e.id = d.event_id WHERE d.id = ${driveId} AND e.estate_id = ${estateId}`);
    const drive = res.rows[0];
    if (!drive) throw new DriveNotFoundError();
    const start = input.start ?? drive.start;
    const duration = input.durationMinutes ?? durationBetween(drive.start, drive.end);
    checkTimes(start, duration);
    const name = input.name?.trim() || drive.name;
    await tx.execute(sql`
      UPDATE drives SET name = ${name}, start_time = ${start}, end_time = ${endOf(start, duration)} WHERE id = ${driveId}`);
    await syncEventStart(tx, drive.event_id);
  });
}

/** Deletes a drive. The last drive of an event can't be deleted: an event always has one. */
export async function deleteDrive(estateId: number, driveId: number) {
  await db.transaction(async (tx) => {
    const res = await tx.execute<{ event_id: number; drives: number }>(sql`
      SELECT d.event_id, (SELECT COUNT(*)::int FROM drives x WHERE x.event_id = d.event_id) AS drives
      FROM drives d JOIN events e ON e.id = d.event_id WHERE d.id = ${driveId} AND e.estate_id = ${estateId}`);
    const drive = res.rows[0];
    if (!drive) throw new DriveNotFoundError();
    if (drive.drives <= 1) throw new DriveRuleError('An event needs at least one drive.');
    await tx.execute(sql`DELETE FROM drives WHERE id = ${driveId}`);
    await syncEventStart(tx, drive.event_id);
  });
}
