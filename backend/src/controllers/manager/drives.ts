import { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { drivesTable } from '../../db/schema/drives';
import { eventsTable } from '../../db/schema/events';
import { logError } from '@/utils/logError';
import { driveSchema } from '@/schemas';

async function resolveEvent(eventId: number, estateId: number) {
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, eventId))
    .limit(1);
  return event?.estateId === estateId ? event : null;
}

export async function postCreateDrive(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const eventId = Number(req.params.eventId);

    const event = await resolveEvent(eventId, user.estateId!);
    if (!event) return res.status(404).send('Event not found');

    const result = driveSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error.issues[0].message);

    const [drive] = await db
      .insert(drivesTable)
      .values({ eventId, ...result.data })
      .returning();

    res.redirect(`/manager/events/${eventId}/drives/${drive.id}`);
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export async function getDrive(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const eventId = Number(req.params.eventId);
    const driveId = Number(req.params.id);

    const event = await resolveEvent(eventId, user.estateId!);
    if (!event) return res.status(404).send('Event not found');

    const [drive] = await db
      .select()
      .from(drivesTable)
      .where(and(eq(drivesTable.id, driveId), eq(drivesTable.eventId, eventId)))
      .limit(1);

    if (!drive) return res.status(404).send('Drive not found');

    res.render('manager/events/drive', { title: drive.name, user, event, drive, breadcrumbs: [{ label: 'Events', href: '/manager/events' }, { label: event.eventName, href: `/manager/events/${event.id}` }, { label: drive.name }] });
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}
