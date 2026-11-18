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

describe('GET /manager/events/:eventId/drives/:id', () => {
  let driveId: number;

  beforeAll(async () => {
    const [drive] = await db
      .insert(drivesTable)
      .values({ eventId, name: 'Existing Drive', startTime: '09:00', endTime: '11:00' })
      .returning();
    driveId = drive.id;
  });

  it("sends a drive page to the React event page's drives tab", async () => {
    const res = await setup.agent.get(`/manager/events/${eventId}/drives/${driveId}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/app/manager/events/${eventId}?tab=drives`);
  });
});
