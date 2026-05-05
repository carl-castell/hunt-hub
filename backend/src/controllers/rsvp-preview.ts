import { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { eventsTable } from '../db/schema/events';
import { drivesTable } from '../db/schema/drives';
import { logError } from '@/utils/logError';

export async function getPreviewRsvp(req: Request, res: Response) {
  try {
    const eventId = Number(req.params.eventId);
    if (!Number.isFinite(eventId)) return res.status(400).send('Invalid event id');

    const estateId = req.session.user!.estateId!;
    const [event] = await db.select().from(eventsTable)
      .where(and(eq(eventsTable.id, eventId), eq(eventsTable.estateId, estateId)))
      .limit(1);
    if (!event) return res.status(404).send('Event not found');

    const drives = await db
      .select({ name: drivesTable.name, startTime: drivesTable.startTime, endTime: drivesTable.endTime })
      .from(drivesTable)
      .where(eq(drivesTable.eventId, eventId));

    const stepParam = Number(req.query.step) || 0;
    // If a step is present the guest has already accepted — no need to pass state explicitly
    const state = typeof req.query.state === 'string' ? req.query.state : (stepParam > 0 ? 'yes' : 'open');

    const invitation = {
      publicId: `preview/${eventId}`,
      firstName: 'John',
      lastName: 'Doe',
      eventName: event.eventName,
      eventDate: event.date,
      eventTime: event.time,
      response: state,
      respondBy: null,
      respondedAt: null,
      openedAt: null,
    };

    res.locals.layout = 'rsvp/layout';
    const title = event.eventName;
    const base = { invitation, drives, hasLicense: false, hasCert: false, hasValidCheckedLicense: false, contact: null };

    if (state === 'no') return res.render('rsvp/declined', { title, ...base });
    if (state === 'yes') {
      if (stepParam === 0) {
        // Show presence indicators (✅) but no actual values
        return res.render('rsvp/confirmed', {
          title,
          ...base,
          hasLicense: true,
          hasCert: true,
          hasValidCheckedLicense: true,
          contact: { dateOfBirth: '—', phone: '—' },
        });
      }
      return res.render('rsvp/upload', { title, step: Math.min(3, Math.max(1, stepParam)), ...base });
    }
    return res.render('rsvp/respond', { title, ...base });
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

export function postPreviewRespond(req: Request, res: Response) {
  const { eventId } = req.params;
  const answer = req.body.answer === 'yes' ? 'yes' : 'no';
  res.redirect(answer === 'yes'
    ? `/rsvp/preview/${eventId}?state=yes&step=1`
    : `/rsvp/preview/${eventId}?state=no`
  );
}

export function postPreviewUploadLicense(req: Request, res: Response) {
  res.redirect(`/rsvp/preview/${req.params.eventId}?state=yes&step=2`);
}

export function postPreviewUploadCertificate(req: Request, res: Response) {
  res.redirect(`/rsvp/preview/${req.params.eventId}?state=yes&step=3`);
}

export function postPreviewUploadDetails(req: Request, res: Response) {
  res.redirect(`/rsvp/preview/${req.params.eventId}?state=yes`);
}
