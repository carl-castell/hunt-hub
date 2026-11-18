import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { listAreas } from '@/services/areas';
import { listEvents, type EventSummary } from '@/services/events';
import { listInvitations, type InvitationRow } from '@/services/invitations';
import { todayInGermany } from '@/services/stands';
import { guestFilters } from '@/shared/invitationStates';

/**
 * The manager's start page: what needs doing before the next hunts, from the
 * data that exists (events, invitations, documents, areas, stands). Each to-do
 * is a code with its numbers and a target; the client turns it into a
 * sentence and a link (translation-ready).
 */

/** How many upcoming hunts the to-dos look at. */
const HUNTS_CONSIDERED = 3;
/** An answer-by date this close counts as urgent. */
const DEADLINE_DAYS = 7;
/** A hunt this close without any guests is worth a reminder. */
const NO_GUESTS_DAYS = 30;

type HuntRef = { eventId: number; eventName: string; date: string };

export type Todo =
  | (HuntRef & { code: 'documents_to_check'; count: number })
  | (HuntRef & { code: 'coming_without_licence'; count: number; names: string[] })
  | (HuntRef & { code: 'answer_deadline'; count: number; respondBy: string; daysLeft: number })
  | (HuntRef & { code: 'no_answer'; count: number })
  | (HuntRef & { code: 'not_sent'; count: number })
  | (HuntRef & { code: 'rejected_waiting'; count: number })
  | (HuntRef & { code: 'no_guests'; daysLeft: number })
  | { code: 'stands_damaged'; areaId: number; areaName: string; broken: number; needsRepair: number }
  | { code: 'area_without_boundary'; areaId: number; areaName: string };

export type DashboardArea = {
  id: number; name: string; hasBoundary: boolean; stands: number; broken: number; needsRepair: number; unchecked: number;
};

const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000);

/** Uploaded documents of non-archived guests that still need checking. */
const documentsToCheck = (invitations: InvitationRow[]) => invitations
  .filter((i) => i.status !== 'archived')
  .reduce((n, i) => n + (i.licence === 'unchecked' ? 1 : 0) + (i.certificate === 'unchecked' ? 1 : 0), 0);

/** Guests whose invitation went out and who haven't answered. */
const withoutAnswer = (invitations: InvitationRow[]) => invitations.filter((i) => guestFilters(i).includes('open'));

/** The to-dos of one hunt, most urgent first. */
export function huntTodos(event: EventSummary, invitations: InvitationRow[], today: string): Todo[] {
  const ref: HuntRef = { eventId: event.id, eventName: event.name, date: event.date };
  const active = invitations.filter((i) => i.status !== 'archived');
  const todos: Todo[] = [];
  const daysLeft = daysBetween(today, event.date);

  const coming = active.filter((i) => i.response === 'yes');
  const withoutLicence = coming.filter((i) => i.licence !== 'valid');
  if (withoutLicence.length > 0) {
    todos.push({ ...ref, code: 'coming_without_licence', count: withoutLicence.length, names: withoutLicence.slice(0, 3).map((i) => `${i.guest.firstName} ${i.guest.lastName}`) });
  }

  const toCheck = documentsToCheck(active);
  if (toCheck > 0) todos.push({ ...ref, code: 'documents_to_check', count: toCheck });

  const noAnswer = withoutAnswer(active);
  const deadlines = noAnswer.map((i) => i.respondBy?.slice(0, 10)).filter((d): d is string => !!d && d >= today).sort();
  const nextDeadline = deadlines[0];
  if (nextDeadline && daysBetween(today, nextDeadline) <= DEADLINE_DAYS) {
    todos.push({ ...ref, code: 'answer_deadline', count: noAnswer.length, respondBy: nextDeadline, daysLeft: daysBetween(today, nextDeadline) });
  } else if (noAnswer.length > 0) {
    todos.push({ ...ref, code: 'no_answer', count: noAnswer.length });
  }

  const notSent = active.filter((i) => i.status === 'staged').length;
  if (notSent > 0) todos.push({ ...ref, code: 'not_sent', count: notSent });

  const rejected = active.reduce((n, i) => n + (i.licence === 'rejected' ? 1 : 0) + (i.certificate === 'rejected' ? 1 : 0), 0);
  if (rejected > 0) todos.push({ ...ref, code: 'rejected_waiting', count: rejected });

  if (active.length === 0 && daysLeft <= NO_GUESTS_DAYS) todos.push({ ...ref, code: 'no_guests', daysLeft });
  return todos;
}

export async function getDashboard(estateId: number, today = todayInGermany()) {
  const [{ upcoming, past }, areas, standCounts, counts] = await Promise.all([
    listEvents(estateId, today),
    listAreas(estateId),
    db.execute<{ area_id: number; broken: number; needs_repair: number; unchecked: number }>(sql`
      SELECT s.area_id,
             COUNT(*) FILTER (WHERE s.status = 'broken')::int AS broken,
             COUNT(*) FILTER (WHERE s.status = 'needs_repair')::int AS needs_repair,
             COUNT(*) FILTER (WHERE s.status IS NULL)::int AS unchecked
      FROM stands s JOIN areas a ON a.id = s.area_id WHERE a.estate_id = ${estateId} GROUP BY s.area_id`),
    db.execute<{ guests: number; groups: number }>(sql`
      SELECT (SELECT COUNT(*)::int FROM users u JOIN contacts c ON c.user_id = u.id WHERE u.estate_id = ${estateId} AND u.role = 'guest') AS guests,
             (SELECT COUNT(*)::int FROM guest_groups g WHERE g.estate_id = ${estateId}) AS groups`),
  ]);

  const considered = upcoming.slice(0, HUNTS_CONSIDERED);
  const invitationsPerHunt = await Promise.all(considered.map((e) => listInvitations(estateId, e.id)));
  const todos: Todo[] = considered.flatMap((e, i) => huntTodos(e, invitationsPerHunt[i], today));

  const byArea = new Map(standCounts.rows.map((r) => [r.area_id, r]));
  const areaList: DashboardArea[] = areas.map((a) => {
    const c = byArea.get(a.id);
    return { id: a.id, name: a.name, hasBoundary: a.hasBoundary, stands: Number(a.standCount), broken: c?.broken ?? 0, needsRepair: c?.needs_repair ?? 0, unchecked: c?.unchecked ?? 0 };
  });
  for (const a of areaList) {
    if (a.broken > 0 || a.needsRepair > 0) todos.push({ code: 'stands_damaged', areaId: a.id, areaName: a.name, broken: a.broken, needsRepair: a.needsRepair });
  }
  for (const a of areaList) {
    if (!a.hasBoundary) todos.push({ code: 'area_without_boundary', areaId: a.id, areaName: a.name });
  }

  const next = upcoming[0];
  return {
    today,
    // The next hunt with what its buttons need (the first of the hunts considered).
    nextHunt: next
      ? { ...next, daysLeft: daysBetween(today, next.date), toCheck: documentsToCheck(invitationsPerHunt[0]), toRemind: withoutAnswer(invitationsPerHunt[0]).length }
      : null,
    upcoming: upcoming.slice(0, 5),
    pastCount: past.length,
    todos,
    areas: areaList,
    counts: counts.rows[0] ?? { guests: 0, groups: 0 },
  };
}
