import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '@/app';
import { db } from '@/db';
import { eventsTable } from '@/db/schema/events';
import { estatesTable } from '@/db/schema/estates';
import { eq } from 'drizzle-orm';
import { setupManager, teardown, ManagerSetup } from '@/tests/helpers/manager';

let setup: ManagerSetup;
let eventId: number;
let otherEstateId: number;
let otherEventId: number;

beforeAll(async () => {
  setup = await setupManager('events');

  const [event] = await db
    .insert(eventsTable)
    .values({ eventName: 'Existing Event', date: '2027-06-15', time: '09:00', estateId: setup.estateId })
    .returning();
  eventId = event.id;

  const [otherEstate] = await db.insert(estatesTable).values({ name: 'Other Events Estate' }).returning();
  otherEstateId = otherEstate.id;
  const [otherEvent] = await db
    .insert(eventsTable)
    .values({ eventName: 'Other Event', date: '2027-06-15', time: '09:00', estateId: otherEstate.id })
    .returning();
  otherEventId = otherEvent.id;
});

afterAll(async () => {
  await db.delete(estatesTable).where(eq(estatesTable.id, otherEstateId));
  await teardown(setup.estateId);
});

// ── POST /manager/events ──────────────────────────────────────────────────────

describe('POST /manager/events', () => {
  it('creates an event and redirects to event page', async () => {
    const res = await setup.agent.post('/manager/events').send({
      eventName: 'Autumn Hunt', date: '2027-10-01', time: '08:00',
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/manager\/events\/\d+$/);
  });

  it('returns 400 for missing event name', async () => {
    const res = await setup.agent.post('/manager/events').send({
      eventName: '', date: '2027-10-01', time: '08:00',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing date', async () => {
    const res = await setup.agent.post('/manager/events').send({
      eventName: 'No Date', date: '', time: '08:00',
    });
    expect(res.status).toBe(400);
  });

  it('redirects to /login when not authenticated', async () => {
    const res = await request(app).post('/manager/events').send({
      eventName: 'Unauth', date: '2027-10-01', time: '08:00',
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});

// ── GET /manager/events/:id ───────────────────────────────────────────────────

describe('GET /manager/events/:id', () => {
  it('returns 200 for an event in own estate', async () => {
    const res = await setup.agent.get(`/manager/events/${eventId}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 for an event in another estate', async () => {
    const res = await setup.agent.get(`/manager/events/${otherEventId}`);
    expect(res.status).toBe(404);
  });
});

// ── POST /manager/events/:id/update ──────────────────────────────────────────

describe('POST /manager/events/:id/update', () => {
  it('updates event and redirects', async () => {
    const res = await setup.agent
      .post(`/manager/events/${eventId}/update`)
      .send({ eventName: 'Updated Event', date: '2027-07-01', time: '10:00' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/manager/events/${eventId}`);
  });

  it('returns 400 for missing name', async () => {
    const res = await setup.agent
      .post(`/manager/events/${eventId}/update`)
      .send({ eventName: '', date: '2027-07-01', time: '10:00' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an event in another estate', async () => {
    const res = await setup.agent
      .post(`/manager/events/${otherEventId}/update`)
      .send({ eventName: 'Hack', date: '2027-01-01', time: '10:00' });
    expect(res.status).toBe(404);
  });
});

// ── POST /manager/events/:id/delete ──────────────────────────────────────────

describe('POST /manager/events/:id/delete', () => {
  it('returns 404 for an event in another estate', async () => {
    const res = await setup.agent.post(`/manager/events/${otherEventId}/delete`);
    expect(res.status).toBe(404);
  });

  it('deletes event and redirects to /manager/events', async () => {
    const [event] = await db
      .insert(eventsTable)
      .values({ eventName: 'To Delete', date: '2027-01-01', time: '09:00', estateId: setup.estateId })
      .returning();

    const res = await setup.agent.post(`/manager/events/${event.id}/delete`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/manager/events');
  });
});
