import { Request, Response } from 'express';
import { and, asc, count, eq, ilike, inArray, notInArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { invitationsTable } from '../../db/schema/invitations';
import { eventsTable } from '../../db/schema/events';
import { usersTable } from '../../db/schema/users';
import { contactsTable } from '../../db/schema/contacts';
import { guestGroupMembersTable, guestGroupsTable } from '../../db/schema/guest_groups';
import { renderTemplate, sendMail } from '../../mail';
import { audit } from '../../audit';
import crypto from 'crypto';

const PICKER_LIMIT = 50;

async function findEvent(eventId: number, estateId: number) {
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.id, eventId), eq(eventsTable.estateId, estateId)))
    .limit(1);
  return event ?? null;
}

export async function getInvitation(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const eventId = Number(req.params.eventId);
    const invitationId = Number(req.params.invitationId);
    if (!Number.isFinite(eventId) || !Number.isFinite(invitationId)) return res.status(400).send('Invalid id');

    const event = await findEvent(eventId, user.estateId!);
    if (!event) return res.status(404).send('Event not found');

    const [row] = await db
      .select()
      .from(invitationsTable)
      .innerJoin(usersTable, eq(invitationsTable.userId, usersTable.id))
      .where(and(eq(invitationsTable.id, invitationId), eq(invitationsTable.eventId, eventId)))
      .limit(1);

    if (!row) return res.status(404).send('Invitation not found');

    const invitation = { ...row.invitations, ...row.users };

    res.render('manager/invitations/show', {
      title: `${row.users.firstName} ${row.users.lastName}`,
      user,
      event,
      invitation,
      breadcrumbs: [
        { label: 'Events', href: '/manager/events' },
        { label: event.eventName, href: `/manager/events/${eventId}` },
        { label: 'Guest List', href: `/manager/events/${eventId}/invitations` },
        { label: `${row.users.firstName} ${row.users.lastName}` },
      ],
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

const VALID_STATUSES = ['staged', 'sent_email', 'sent_manually', 'waitlist', 'archived'] as const;
const VALID_RESPONSES = ['open', 'yes', 'no'] as const;

export async function getInvitationList(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const eventId = Number(req.params.eventId);
    if (!Number.isFinite(eventId)) return res.status(400).send('Invalid event id');

    const event = await findEvent(eventId, user.estateId!);
    if (!event) return res.status(404).send('Event not found');

    const { status, response } = req.query as { status?: string; response?: string };
    const statusFilter = status && (VALID_STATUSES as readonly string[]).includes(status) ? status : null;
    const responseFilter = response && (VALID_RESPONSES as readonly string[]).includes(response) ? response : null;

    const invitations = await db
      .select({
        id: invitationsTable.id,
        status: invitationsTable.status,
        response: invitationsTable.response,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        userId: invitationsTable.userId,
      })
      .from(invitationsTable)
      .innerJoin(usersTable, eq(invitationsTable.userId, usersTable.id))
      .where(and(
        eq(invitationsTable.eventId, eventId),
        statusFilter ? eq(invitationsTable.status, statusFilter as typeof VALID_STATUSES[number]) : undefined,
        responseFilter ? eq(invitationsTable.response, responseFilter as typeof VALID_RESPONSES[number]) : undefined,
      ))
      .orderBy(asc(usersTable.lastName), asc(usersTable.firstName));

    const isPartial = req.headers['hx-request'] === 'true';
    if (isPartial) {
      res.locals.layout = false;
      return res.render('manager/invitations/list-rows', { event, invitations });
    }

    res.render('manager/invitations/list', {
      title: 'Guest List',
      user,
      event,
      invitations,
      statusFilter,
      responseFilter,
      breadcrumbs: [
        { label: 'Events', href: '/manager/events' },
        { label: event.eventName, href: `/manager/events/${eventId}` },
        { label: 'Guest List' },
      ],
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function getInvitationPicker(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const eventId = Number(req.params.eventId);
    if (!Number.isFinite(eventId)) return res.status(400).send('Invalid event id');

    const event = await findEvent(eventId, user.estateId!);
    if (!event) return res.status(404).send('Event not found');

    const { search, offset: offsetParam } = req.query as { search?: string; offset?: string };
    const offset = Math.max(0, Number(offsetParam) || 0);
    const term = search?.trim() ?? '';

    const stagedRows = await db
      .select({ userId: invitationsTable.userId })
      .from(invitationsTable)
      .where(eq(invitationsTable.eventId, eventId));
    const stagedIds = stagedRows.map(r => r.userId);

    const estateWhere = eq(usersTable.estateId, user.estateId!);
    const baseWhere = stagedIds.length > 0
      ? and(estateWhere, notInArray(usersTable.id, stagedIds))
      : estateWhere;

    const whereClause = term
      ? and(baseWhere, or(
          ilike(usersTable.firstName, `%${term}%`),
          ilike(usersTable.lastName, `%${term}%`),
          inArray(usersTable.id,
            db.select({ userId: guestGroupMembersTable.userId })
              .from(guestGroupMembersTable)
              .innerJoin(guestGroupsTable, eq(guestGroupMembersTable.groupId, guestGroupsTable.id))
              .where(and(eq(guestGroupsTable.estateId, user.estateId!), ilike(guestGroupsTable.name, `%${term}%`)))
          )
        ))
      : baseWhere;

    const [[{ total }], rows] = await Promise.all([
      db.select({ total: count() })
        .from(contactsTable)
        .innerJoin(usersTable, eq(contactsTable.userId, usersTable.id))
        .where(whereClause),
      db.select()
        .from(contactsTable)
        .innerJoin(usersTable, eq(contactsTable.userId, usersTable.id))
        .where(whereClause)
        .orderBy(asc(usersTable.lastName), asc(usersTable.firstName))
        .limit(PICKER_LIMIT + 1)
        .offset(offset),
    ]);

    const hasMore = rows.length > PICKER_LIMIT;
    const guests = rows.slice(0, PICKER_LIMIT).map(r => ({ ...r.users, ...r.contacts }));

    const guestIds = guests.map(g => g.id);
    const groupRows = guestIds.length > 0
      ? await db
          .select({ userId: guestGroupMembersTable.userId, groupName: guestGroupsTable.name })
          .from(guestGroupMembersTable)
          .innerJoin(guestGroupsTable, eq(guestGroupMembersTable.groupId, guestGroupsTable.id))
          .where(and(
            eq(guestGroupsTable.estateId, user.estateId!),
            inArray(guestGroupMembersTable.userId, guestIds)
          ))
      : [];

    const groupsByUser = new Map<number, string[]>();
    for (const r of groupRows) {
      const names = groupsByUser.get(r.userId) ?? [];
      names.push(r.groupName);
      groupsByUser.set(r.userId, names);
    }
    const guestsWithGroups = guests.map(g => ({ ...g, groups: groupsByUser.get(g.id) ?? [] }));

    const isPartial = req.headers['hx-request'] === 'true';
    const viewData = { event, guests: guestsWithGroups, hasMore, total, search: term, nextOffset: offset + PICKER_LIMIT };

    if (isPartial) {
      res.locals.layout = false;
      return res.render('manager/invitations/picker-rows', viewData);
    }

    res.render('manager/invitations/picker', {
      title: 'Select Guests',
      user,
      ...viewData,
      breadcrumbs: [
        { label: 'Events', href: '/manager/events' },
        { label: event.eventName, href: `/manager/events/${eventId}` },
        { label: 'Select Guests' },
      ],
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function postRemoveInvitation(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const eventId = Number(req.params.eventId);
    const invitationId = Number(req.params.invitationId);
    if (!Number.isFinite(eventId) || !Number.isFinite(invitationId)) return res.status(400).send('Invalid id');

    const event = await findEvent(eventId, user.estateId!);
    if (!event) return res.status(404).send('Event not found');

    await db.delete(invitationsTable).where(
      and(eq(invitationsTable.id, invitationId), eq(invitationsTable.eventId, eventId))
    );

    res.redirect(`/manager/events/${eventId}/invitations`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function postStageInvitations(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const eventId = Number(req.params.eventId);
    if (!Number.isFinite(eventId)) return res.status(400).send('Invalid event id');

    const event = await findEvent(eventId, user.estateId!);
    if (!event) return res.status(404).send('Event not found');

    const rawIds = req.body.guestIds;
    const guestIds: number[] = Array.isArray(rawIds)
      ? rawIds.map(Number).filter(n => Number.isFinite(n))
      : typeof rawIds === 'string' && rawIds
        ? [Number(rawIds)].filter(n => Number.isFinite(n))
        : [];

    if (guestIds.length > 0) {
      const values = guestIds.map(userId => ({
        publicId: crypto.randomUUID(),
        eventId,
        userId,
        status: 'staged' as const,
        response: 'open' as const,
      }));
      await db.insert(invitationsTable).values(values).onConflictDoNothing();
    }

    res.redirect(`/manager/events/${eventId}/invitations`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function getPreviewInvitation(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const eventId = Number(req.params.eventId);
    if (!Number.isFinite(eventId)) return res.status(400).send('Invalid event id');

    const event = await findEvent(eventId, user.estateId!);
    if (!event) return res.status(404).send('Event not found');

    const rawMessage = typeof req.query.message === 'string' ? req.query.message : '';
    const personalised = rawMessage
      .replace(/\{\{firstName\}\}/g, 'Max')
      .replace(/\{\{lastName\}\}/g, 'Mustermann');

    const baseUrl = process.env.APP_URL ?? `${req.protocol}://${req.get('host')}`;
    const html = await renderTemplate('invitation', {
      message: personalised,
      eventName: event.eventName,
      year: new Date().getFullYear(),
      rsvpUrl: `${baseUrl}/rsvp/preview/${eventId}`,
    });

    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function getSendInvitations(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const eventId = Number(req.params.eventId);
    if (!Number.isFinite(eventId)) return res.status(400).send('Invalid event id');

    const event = await findEvent(eventId, user.estateId!);
    if (!event) return res.status(404).send('Event not found');

    const rows = await db
      .select({
        id: invitationsTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: contactsTable.email,
      })
      .from(invitationsTable)
      .innerJoin(usersTable, eq(invitationsTable.userId, usersTable.id))
      .innerJoin(contactsTable, eq(contactsTable.userId, usersTable.id))
      .where(and(eq(invitationsTable.eventId, eventId), eq(invitationsTable.status, 'staged')))
      .orderBy(asc(usersTable.lastName), asc(usersTable.firstName));

    res.render('manager/invitations/send', {
      title: 'Send Invitations',
      user,
      event,
      invitations: rows,
      breadcrumbs: [
        { label: 'Events', href: '/manager/events' },
        { label: event.eventName, href: `/manager/events/${eventId}` },
        { label: 'Guest List', href: `/manager/events/${eventId}/invitations` },
        { label: 'Send Invitations' },
      ],
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

const sendSchema = z.object({
  message: z.string().min(1, 'Message is required').max(5000),
  respondBy: z.string().optional(),
  invitationIds: z.preprocess(
    (val) => (Array.isArray(val) ? val : val != null && val !== '' ? [val] : []),
    z.array(z.coerce.number().int().positive())
  ),
});

export async function postSendInvitations(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const eventId = Number(req.params.eventId);
    if (!Number.isFinite(eventId)) return res.status(400).send('Invalid event id');

    const event = await findEvent(eventId, user.estateId!);
    if (!event) return res.status(404).send('Event not found');

    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).send(parsed.error.issues[0].message);

    const { message, respondBy, invitationIds } = parsed.data;

    if (invitationIds.length === 0) return res.status(400).send('Select at least one guest.');

    const respondByDate: Date | null = (() => {
      if (!respondBy) return null;
      const d = new Date(respondBy);
      return isNaN(d.getTime()) ? null : d;
    })();

    type ResultRow = { firstName: string; lastName: string; email: string };
    const sent: ResultRow[] = [];
    const failed: (ResultRow & { error: string })[] = [];

    for (const invId of invitationIds) {
      const [row] = await db
        .select({
          invId: invitationsTable.id,
          publicId: invitationsTable.publicId,
          status: invitationsTable.status,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
          email: contactsTable.email,
        })
        .from(invitationsTable)
        .innerJoin(usersTable, eq(invitationsTable.userId, usersTable.id))
        .innerJoin(contactsTable, eq(contactsTable.userId, usersTable.id))
        .where(and(
          eq(invitationsTable.id, invId),
          eq(invitationsTable.eventId, eventId),
          eq(invitationsTable.status, 'staged'),
        ))
        .limit(1);

      if (!row) continue;

      const personalised = message
        .replace(/\{\{firstName\}\}/g, row.firstName)
        .replace(/\{\{lastName\}\}/g, row.lastName);

      try {
        const baseUrl = process.env.APP_URL ?? `${req.protocol}://${req.get('host')}`;
        const rsvpUrl = `${baseUrl}/rsvp/${row.publicId}`;
        const html = await renderTemplate('invitation', {
          message: personalised,
          eventName: event.eventName,
          year: new Date().getFullYear(),
          rsvpUrl,
        });

        await sendMail({
          to: row.email,
          subject: `Invitation – ${event.eventName}`,
          html,
          fromName: res.locals.estateName || undefined,
        });

        await db
          .update(invitationsTable)
          .set({
            status: 'sent_email',
            emailSentAt: new Date(),
            ...(respondByDate ? { respondBy: respondByDate } : {}),
          })
          .where(eq(invitationsTable.id, invId));

        sent.push({ firstName: row.firstName, lastName: row.lastName, email: row.email });
      } catch (emailErr) {
        console.error(`[invite] Failed to send to ${row.email}:`, emailErr);
        failed.push({
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          error: emailErr instanceof Error ? emailErr.message : 'Unknown error',
        });
      }
    }

    await audit({
      userId: user.id,
      event: 'invitation_email_sent',
      ip: req.ip,
      metadata: { eventId, sentCount: sent.length, failedCount: failed.length },
    });

    const isPartial = req.headers['hx-request'] === 'true';
    if (isPartial) {
      res.locals.layout = false;
      return res.render('manager/invitations/send-result', { event, sent, failed });
    }

    res.redirect(`/manager/events/${eventId}/invitations?sent=${sent.length}&failed=${failed.length}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}
