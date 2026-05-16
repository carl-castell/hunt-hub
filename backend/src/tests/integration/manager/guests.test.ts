import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '@/app';
import { db } from '@/db';
import { usersTable } from '@/db/schema/users';
import { contactsTable } from '@/db/schema/contacts';
import { estatesTable } from '@/db/schema/estates';
import { guestGroupsTable, guestGroupMembersTable } from '@/db/schema/guest_groups';
import { eq } from 'drizzle-orm';
import { setupManager, teardown, ManagerSetup } from '@/tests/helpers/manager';

let setup: ManagerSetup;
let guestId: number;
let otherEstateId: number;
let otherGuestId: number;

beforeAll(async () => {
  setup = await setupManager('guests');

  const [guest] = await db
    .insert(usersTable)
    .values({ firstName: 'Existing', lastName: 'Guest', role: 'guest', estateId: setup.estateId })
    .returning();
  guestId = guest.id;
  // guest controller joins contactsTable — a row is required for the page to render
  await db.insert(contactsTable).values({ userId: guest.id, email: `existing-guest-${setup.estateId}@test.com` });

  const [otherEstate] = await db.insert(estatesTable).values({ name: 'Other Guests Estate' }).returning();
  otherEstateId = otherEstate.id;
  const [otherGuest] = await db
    .insert(usersTable)
    .values({ firstName: 'Other', lastName: 'Guest', role: 'guest', estateId: otherEstate.id })
    .returning();
  otherGuestId = otherGuest.id;
  // guest controller joins contactsTable — a row is required for the page to render
  await db.insert(contactsTable).values({ userId: otherGuest.id, email: `other-guest-${otherEstate.id}@test.com` });
});

afterAll(async () => {
  await db.delete(usersTable).where(eq(usersTable.estateId, otherEstateId));
  await db.delete(estatesTable).where(eq(estatesTable.id, otherEstateId));
  await teardown(setup.estateId);
});

describe('GET /manager/guests', () => {
  it('returns 200 for authenticated manager', async () => {
    const res = await setup.agent.get('/manager/guests');
    expect(res.status).toBe(200);
  });

  it('returns partial HTML when hx-request header is present', async () => {
    const res = await setup.agent.get('/manager/guests').set('hx-request', 'true');
    expect(res.status).toBe(200);
  });

  it('redirects to /login when not authenticated', async () => {
    const res = await request(app).get('/manager/guests');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});

describe('POST /manager/guests', () => {
  it('creates a guest and redirects to guest page', async () => {
    const res = await setup.agent.post('/manager/guests').send({
      firstName: 'New', lastName: 'Guest', email: `new-guest-${setup.estateId}@test.com`,
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/manager\/guests\/\d+$/);
  });

  it('returns 200 with error for an invalid email', async () => {
    const res = await setup.agent.post('/manager/guests').send({
      firstName: 'Bad', lastName: 'Email', email: 'not-an-email',
    });
    expect(res.status).toBe(200);
  });

  it('returns 200 with error for missing required fields', async () => {
    const res = await setup.agent.post('/manager/guests').send({});
    expect(res.status).toBe(200);
  });
});

describe('GET /manager/guests/:id', () => {
  it('returns 200 for a guest in own estate', async () => {
    const res = await setup.agent.get(`/manager/guests/${guestId}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 for a guest belonging to another estate', async () => {
    const res = await setup.agent.get(`/manager/guests/${otherGuestId}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-existent guest', async () => {
    const res = await setup.agent.get('/manager/guests/999999');
    expect(res.status).toBe(404);
  });
});

describe('POST /manager/guests/:id/update', () => {
  it('updates guest details and redirects', async () => {
    const res = await setup.agent
      .post(`/manager/guests/${guestId}/update`)
      .send({ firstName: 'Updated', lastName: 'Guest', email: `updated-guest-${setup.estateId}@test.com` });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/manager/guests/${guestId}`);
  });

  it('returns 400 for an invalid email', async () => {
    const res = await setup.agent
      .post(`/manager/guests/${guestId}/update`)
      .send({ firstName: 'Bad', lastName: 'Email', email: 'not-valid' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a guest in another estate', async () => {
    const res = await setup.agent
      .post(`/manager/guests/${otherGuestId}/update`)
      .send({ firstName: 'Hack', lastName: 'Attempt', email: 'hack@test.com' });
    expect(res.status).toBe(404);
  });
});

describe('POST /manager/guests/:id/delete', () => {
  it('returns 404 for a guest in another estate', async () => {
    const res = await setup.agent.post(`/manager/guests/${otherGuestId}/delete`);
    expect(res.status).toBe(404);
  });

  it('deletes guest and redirects to /manager/guests', async () => {
    const [guest] = await db
      .insert(usersTable)
      .values({ firstName: 'Delete', lastName: 'Me', role: 'guest', estateId: setup.estateId })
      .returning();
    // guest controller joins contactsTable — a row is required for the page to render
    await db.insert(contactsTable).values({ userId: guest.id, email: `delete-guest-${guest.id}@test.com` });

    const res = await setup.agent.post(`/manager/guests/${guest.id}/delete`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/manager/guests');
  });
});

describe('POST /manager/guests/:id/add-to-group', () => {
  let groupId: number;

  beforeAll(async () => {
    const [group] = await db
      .insert(guestGroupsTable)
      .values({ name: 'Group Test', estateId: setup.estateId })
      .returning();
    groupId = group.id;
  });

  afterAll(async () => {
    await db.delete(guestGroupsTable).where(eq(guestGroupsTable.id, groupId));
  });

  it('adds guest to an existing group by groupId and redirects', async () => {
    const res = await setup.agent
      .post(`/manager/guests/${guestId}/add-to-group`)
      .send({ groupId: String(groupId) });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/manager/guests/${guestId}`);
  });

  it('creates a new group by name and redirects', async () => {
    const res = await setup.agent
      .post(`/manager/guests/${guestId}/add-to-group`)
      .send({ newGroupName: 'Brand New Group' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/manager/guests/${guestId}`);
  });

  it('returns 400 when neither groupId nor newGroupName is provided', async () => {
    const res = await setup.agent
      .post(`/manager/guests/${guestId}/add-to-group`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for a guest in another estate', async () => {
    const res = await setup.agent
      .post(`/manager/guests/${otherGuestId}/add-to-group`)
      .send({ groupId: String(groupId) });
    expect(res.status).toBe(404);
  });
});

describe('POST /manager/guests/:id/remove-from-group/:groupId', () => {
  let groupId: number;

  beforeAll(async () => {
    const [group] = await db
      .insert(guestGroupsTable)
      .values({ name: 'Remove Test Group', estateId: setup.estateId })
      .returning();
    groupId = group.id;
    await db.insert(guestGroupMembersTable).values({ groupId: group.id, userId: guestId });
  });

  afterAll(async () => {
    await db.delete(guestGroupsTable).where(eq(guestGroupsTable.id, groupId));
  });

  it('removes guest from group and redirects', async () => {
    const res = await setup.agent.post(`/manager/guests/${guestId}/remove-from-group/${groupId}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/manager/guests/${guestId}`);
  });

  it('returns 404 for a group in another estate', async () => {
    const res = await setup.agent.post(`/manager/guests/${guestId}/remove-from-group/999999`);
    expect(res.status).toBe(404);
  });
});
