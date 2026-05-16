import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/db';
import { areasTable } from '@/db/schema/areas';
import { eventsTable } from '@/db/schema/events';
import { eq } from 'drizzle-orm';
import { setupManager, teardown, ManagerSetup } from '@/tests/helpers/manager';

describe('GET /manager — empty state', () => {
  let setup: ManagerSetup;

  beforeAll(async () => { setup = await setupManager('dash-empty'); });
  afterAll(async () => { await teardown(setup.estateId); });

  it('renders the dashboard title', async () => {
    const res = await setup.agent.get('/manager');
    expect(res.text).toContain('Dashboard');
  });

  it('shows "No upcoming events" when there are none', async () => {
    const res = await setup.agent.get('/manager');
    expect(res.text).toContain('No upcoming events');
  });

  it('shows "No areas yet" when there are none', async () => {
    const res = await setup.agent.get('/manager');
    expect(res.text).toContain('No areas yet');
  });

  it('renders quick navigation links', async () => {
    const res = await setup.agent.get('/manager');
    expect(res.text).toContain('href="/manager/guests"');
    expect(res.text).toContain('href="/manager/estate"');
  });
});

describe('GET /manager — with an area', () => {
  let setup: ManagerSetup;
  let areaId: number;

  beforeAll(async () => {
    setup = await setupManager('dash-areas');
    const [area] = await db
      .insert(areasTable)
      .values({ estateId: setup.estateId, name: 'North Wood' })
      .returning();
    areaId = area.id;
  });

  afterAll(async () => {
    await db.delete(areasTable).where(eq(areasTable.id, areaId));
    await teardown(setup.estateId);
  });

  it('shows the area name', async () => {
    const res = await setup.agent.get('/manager');
    expect(res.text).toContain('North Wood');
  });
});

describe('GET /manager — with a future event', () => {
  let setup: ManagerSetup;
  let eventId: number;

  beforeAll(async () => {
    setup = await setupManager('dash-future');
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const dateStr = futureDate.toISOString().split('T')[0];
    const [event] = await db
      .insert(eventsTable)
      .values({ estateId: setup.estateId, eventName: 'Annual Pheasant Drive', date: dateStr, time: '09:00' })
      .returning();
    eventId = event.id;
  });

  afterAll(async () => {
    await db.delete(eventsTable).where(eq(eventsTable.id, eventId));
    await teardown(setup.estateId);
  });

  it('shows the event name', async () => {
    const res = await setup.agent.get('/manager');
    expect(res.text).toContain('Annual Pheasant Drive');
  });
});

describe('GET /manager — past event not shown', () => {
  let setup: ManagerSetup;
  let eventId: number;

  beforeAll(async () => {
    setup = await setupManager('dash-past');
    const [event] = await db
      .insert(eventsTable)
      .values({ estateId: setup.estateId, eventName: 'Old Winter Hunt', date: '2020-01-01', time: '09:00' })
      .returning();
    eventId = event.id;
  });

  afterAll(async () => {
    await db.delete(eventsTable).where(eq(eventsTable.id, eventId));
    await teardown(setup.estateId);
  });

  it('does not show the past event name', async () => {
    const res = await setup.agent.get('/manager');
    expect(res.text).not.toContain('Old Winter Hunt');
  });

  it('still shows "No upcoming events"', async () => {
    const res = await setup.agent.get('/manager');
    expect(res.text).toContain('No upcoming events');
  });
});
