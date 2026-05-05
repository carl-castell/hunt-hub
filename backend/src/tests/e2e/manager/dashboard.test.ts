import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '@/app';
import { db } from '@/db';
import { areasTable } from '@/db/schema/areas';
import { eventsTable } from '@/db/schema/events';
import { eq } from 'drizzle-orm';
import { setupManager, teardown } from '@/tests/helpers/manager';

describe('GET /manager — dashboard access', () => {
  let estateId: number;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const setup = await setupManager('dash-access');
    estateId = setup.estateId;
    agent = setup.agent;
  });

  afterAll(async () => {
    await teardown(estateId);
  });

  it('redirects unauthenticated requests to /login', async () => {
    const res = await request(app).get('/manager');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('returns 200 for an authenticated manager', async () => {
    const res = await agent.get('/manager');
    expect(res.status).toBe(200);
  });

  it('renders the dashboard title', async () => {
    const res = await agent.get('/manager');
    expect(res.text).toContain('Dashboard');
  });
});

describe('GET /manager — empty state', () => {
  let estateId: number;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const setup = await setupManager('dash-empty');
    estateId = setup.estateId;
    agent = setup.agent;
  });

  afterAll(async () => {
    await teardown(estateId);
  });

  it('shows "No upcoming events" when there are none', async () => {
    const res = await agent.get('/manager');
    expect(res.text).toContain('No upcoming events');
  });

  it('shows "No areas yet" when there are none', async () => {
    const res = await agent.get('/manager');
    expect(res.text).toContain('No areas yet');
  });

  it('always renders quick navigation links', async () => {
    const res = await agent.get('/manager');
    expect(res.text).toContain('href="/manager/guests"');
    expect(res.text).toContain('href="/manager/estate"');
  });
});

describe('GET /manager — with an area', () => {
  let estateId: number;
  let agent: ReturnType<typeof request.agent>;
  let areaId: number;

  beforeAll(async () => {
    const setup = await setupManager('dash-areas');
    estateId = setup.estateId;
    agent = setup.agent;

    const [area] = await db
      .insert(areasTable)
      .values({ estateId, name: 'North Wood' })
      .returning();
    areaId = area.id;
  });

  afterAll(async () => {
    await db.delete(areasTable).where(eq(areasTable.id, areaId));
    await teardown(estateId);
  });

  it('shows the area name', async () => {
    const res = await agent.get('/manager');
    expect(res.text).toContain('North Wood');
  });
});

describe('GET /manager — with a future event', () => {
  let estateId: number;
  let agent: ReturnType<typeof request.agent>;
  let eventId: number;

  beforeAll(async () => {
    const setup = await setupManager('dash-future');
    estateId = setup.estateId;
    agent = setup.agent;

    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const dateStr = futureDate.toISOString().split('T')[0];

    const [event] = await db
      .insert(eventsTable)
      .values({ estateId, eventName: 'Annual Pheasant Drive', date: dateStr, time: '09:00' })
      .returning();
    eventId = event.id;
  });

  afterAll(async () => {
    await db.delete(eventsTable).where(eq(eventsTable.id, eventId));
    await teardown(estateId);
  });

  it('shows the event name', async () => {
    const res = await agent.get('/manager');
    expect(res.text).toContain('Annual Pheasant Drive');
  });
});

describe('GET /manager — past event not shown', () => {
  let estateId: number;
  let agent: ReturnType<typeof request.agent>;
  let eventId: number;

  beforeAll(async () => {
    const setup = await setupManager('dash-past');
    estateId = setup.estateId;
    agent = setup.agent;

    const [event] = await db
      .insert(eventsTable)
      .values({ estateId, eventName: 'Old Winter Hunt', date: '2020-01-01', time: '09:00' })
      .returning();
    eventId = event.id;
  });

  afterAll(async () => {
    await db.delete(eventsTable).where(eq(eventsTable.id, eventId));
    await teardown(estateId);
  });

  it('does not show the past event name', async () => {
    const res = await agent.get('/manager');
    expect(res.text).not.toContain('Old Winter Hunt');
  });

  it('still shows "No upcoming events"', async () => {
    const res = await agent.get('/manager');
    expect(res.text).toContain('No upcoming events');
  });
});
