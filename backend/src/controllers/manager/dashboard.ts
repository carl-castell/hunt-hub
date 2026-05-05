import { Request, Response } from 'express';
import { eq, gte } from 'drizzle-orm';
import { db } from '../../db';
import { areasTable } from '../../db/schema/areas';
import { eventsTable } from '../../db/schema/events';
import { estatesTable } from '@/db/schema';
import { logError } from '@/utils/logError';

export async function getDashboard(req: Request, res: Response) {
  try {
    const user = req.session.user!;

    const estate = await db
      .select()
      .from(estatesTable)
      .where(eq(estatesTable.id, user.estateId!))
      .then(r => r[0]);

    const areas = await db
      .select()
      .from(areasTable)
      .where(eq(areasTable.estateId, user.estateId!));

    const now = new Date();
    const upcomingEvents = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.estateId, user.estateId!));

    const futureEvents = upcomingEvents.filter(e => new Date(e.date) >= now);

    res.render('manager/dashboard', {
      title: 'Dashboard',
      user,
      areas,
      futureEvents,
    });
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}
