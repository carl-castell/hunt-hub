import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { eventsTable } from '../../db/schema/events';
import { drivesTable } from '../../db/schema/drives';
import { logError } from '@/utils/logError';
import { eventSchema } from '@/schemas';
import { createEvent } from '@/services/events';
import { todayInGermany } from '@/services/stands';

export async function getEvents(req: Request, res: Response) {
  try {
    const user = req.session.user!;

    // Today's events count as upcoming (they used to be listed as past).
    const today = todayInGermany();
    const allEvents = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.estateId, user.estateId!));
    const upcomingEvents = allEvents
      .filter(e => e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));
    const pastEvents = allEvents
      .filter(e => e.date < today)
      .sort((a, b) => b.date.localeCompare(a.date));

    res.render('manager/events/list', { title: 'Events', user, upcomingEvents, pastEvents, breadcrumbs: [{ label: 'Events' }] });
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function getEvent(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { id } = req.params;

    const [event] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, Number(id)))
      .limit(1);

    if (!event || event.estateId !== user.estateId) return res.status(404).send('Event not found');

    const drives = await db
      .select()
      .from(drivesTable)
      .where(eq(drivesTable.eventId, Number(id)));

    res.render('manager/events/show', { title: event.eventName, user, event, drives, breadcrumbs: [{ label: 'Events', href: '/manager/events' }, { label: event.eventName }] });
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function postCreateEvent(req: Request, res: Response) {
  try {
    const user = req.session.user!;

    const result = eventSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error.issues[0].message);

    // Same as the React app: the event gets "Drive 1", which starts at the time given here.
    const event = await createEvent(
      user.estateId!,
      { name: result.data.eventName, date: result.data.date, start: result.data.time.slice(0, 5) },
      { userId: user.id, ip: req.ip },
    );

    res.redirect(`/manager/events/${event.id}`);
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function postUpdateEvent(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { id } = req.params;

    const [event] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, Number(id)))
      .limit(1);

    if (!event || event.estateId !== user.estateId) return res.status(404).send('Event not found');

    const result = eventSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error.issues[0].message);

    await db
      .update(eventsTable)
      .set({
        eventName: result.data.eventName,
        date:      result.data.date,
        time:      result.data.time,
      })
      .where(eq(eventsTable.id, Number(id)));

    res.redirect(`/manager/events/${id}`);
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function postDeleteEvent(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const { id } = req.params;

    const [event] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, Number(id)))
      .limit(1);

    if (!event || event.estateId !== user.estateId) return res.status(404).send('Event not found');

    await db.delete(eventsTable).where(eq(eventsTable.id, Number(id)));

    res.redirect('/manager/events');
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}
