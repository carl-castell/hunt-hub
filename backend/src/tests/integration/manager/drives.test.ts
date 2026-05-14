import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/db';
import { eventsTable } from '@/db/schema/events';
import { drivesTable } from '@/db/schema/drives';
import { estatesTable } from '@/db/schema/estates';
import { eq } from 'drizzle-orm';
import { setupManager, teardown, ManagerSetup } from '@/tests/helpers/manager';

let setup: ManagerSetup;
let eventId: number;
let otherEstateId: number;
let otherEventId: number;

beforeAll(async () => {
  setup = await setupManager('drives');

  const [event] = await db
    .insert(eventsTable)
    .values({ eventName: 'Drive Test Event', date: '2028-03-10', time: '08:00', estateId: setup.estateId })
    .returning();
  eventId = event.id;

  const [otherEstate] = await db.insert(estatesTable).values({ name: 'Other Drives Estate' }).returning();
  otherEstateId = otherEstate.id;

  const [otherEvent] = await db
    .insert(eventsTable)
    .values({ eventName: 'Other Drive Event', date: '2028-03-10', time: '08:00', estateId: otherEstate.id })
    .returning();
  otherEventId = otherEvent.id;
});

afterAll(async () => {
  await db.delete(eventsTable).where(eq(eventsTable.id, otherEventId));
  await db.delete(estatesTable).where(eq(estatesTable.id, otherEstateId));
  await teardown(setup.estateId);
});

describe('POST /manager/events/:eventId/drives', () => {
  it('creates a drive and redirects to the drive page', async () => {
    const res = await setup.agent
      .post(`/manager/events/${eventId}/drives`)
      .send({ name: 'Morning Drive', startTime: '08:00', endTime: '10:00' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(
      new RegExp(`^/manager/events/${eventId}/drives/\\d+$`),
    );
  });

  it('returns 400 when the drive name is missing', async () => {
    const res = await setup.agent
      .post(`/manager/events/${eventId}/drives`)
      .send({ name: '', startTime: '08:00', endTime: '10:00' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when startTime is missing', async () => {
    const res = await setup.agent
      .post(`/manager/events/${eventId}/drives`)
      .send({ name: 'Afternoon Drive', startTime: '', endTime: '15:00' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for an event in another estate', async () => {
    const res = await setup.agent
      .post(`/manager/events/${otherEventId}/drives`)
      .send({ name: 'Hack Drive', startTime: '09:00', endTime: '11:00' });

    expect(res.status).toBe(404);
  });
});

describe('GET /manager/events/:eventId/drives/:id', () => {
  let driveId: number;

  beforeAll(async () => {
    const [drive] = await db
      .insert(drivesTable)
      .values({ eventId, name: 'Existing Drive', startTime: '09:00', endTime: '11:00' })
      .returning();
    driveId = drive.id;
  });

  it('returns 200 for a drive in the manager estate', async () => {
    const res = await setup.agent.get(`/manager/events/${eventId}/drives/${driveId}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 for a drive belonging to another estate event', async () => {
    const [otherDrive] = await db
      .insert(drivesTable)
      .values({ eventId: otherEventId, name: 'Other Drive', startTime: '09:00', endTime: '11:00' })
      .returning();

    const res = await setup.agent.get(`/manager/events/${otherEventId}/drives/${otherDrive.id}`);
    expect(res.status).toBe(404);

    await db.delete(drivesTable).where(eq(drivesTable.id, otherDrive.id));
  });
});
