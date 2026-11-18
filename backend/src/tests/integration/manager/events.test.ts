import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/db';
import { eventsTable } from '@/db/schema/events';
import { setupManager, teardown, ManagerSetup } from '@/tests/helpers/manager';

// Creating, changing and deleting events goes through the tRPC API
// (tests in manager-api/); the old URLs only redirect to the React app.

let setup: ManagerSetup;
let eventId: number;

beforeAll(async () => {
  setup = await setupManager('events');

  const [event] = await db
    .insert(eventsTable)
    .values({ eventName: 'Existing Event', date: '2027-06-15', time: '09:00', estateId: setup.estateId })
    .returning();
  eventId = event.id;
});

afterAll(async () => {
  await teardown(setup.estateId);
});

describe('GET /manager/events and /manager/events/:id', () => {
  // The pages live in the React app now (HUN-88); its API checks the estate.
  it('sends the events list to the React app', async () => {
    const res = await setup.agent.get('/manager/events');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/app/manager/events');
  });

  it('sends an event page to the React app', async () => {
    const res = await setup.agent.get(`/manager/events/${eventId}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/app/manager/events/${eventId}`);
  });
});
