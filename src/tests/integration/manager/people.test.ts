import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '@/app';
import { db } from '@/db';
import { usersTable } from '@/db/schema/users';
import { accountsTable } from '@/db/schema/accounts';
import { userAuthTokensTable } from '@/db/schema/user_auth_tokens';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { setupManager, teardown, ManagerSetup } from '@/tests/helpers/manager';

let setup: ManagerSetup;
let staffId: number;

beforeAll(async () => {
  setup = await setupManager('people');

  // Pre-create a staff member for tests that need an existing person
  const [staff] = await db
    .insert(usersTable)
    .values({ firstName: 'Existing', lastName: 'Staff', role: 'staff', estateId: setup.estateId })
    .returning();
  staffId = staff.id;
  const hash = await bcrypt.hash('staffpass', 10);
  await db.insert(accountsTable).values({
    userId: staff.id, email: `existing-staff-${setup.estateId}@test.com`, password: hash, active: false,
  });
});

afterAll(async () => { await teardown(setup.estateId); });

// ── GET /manager/people ───────────────────────────────────────────────────────

describe('GET /manager/people', () => {
  it('returns 200 for authenticated manager', async () => {
    const res = await setup.agent.get('/manager/people');
    expect(res.status).toBe(200);
  });

  it('redirects to /login when not authenticated', async () => {
    const res = await request(app).get('/manager/people');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});

// ── POST /manager/people ──────────────────────────────────────────────────────

describe('POST /manager/people', () => {
  it('creates a user with token and redirects to their page', async () => {
    const email = `new-staff-${setup.estateId}@test.com`;
    const res = await setup.agent.post('/manager/people').send({
      firstName: 'New', lastName: 'Staff', email, role: 'staff',
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/manager\/people\/\d+$/);

    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.email, email)).limit(1);
    expect(account).toBeDefined();

    const [token] = await db
      .select().from(userAuthTokensTable)
      .where(eq(userAuthTokensTable.userId, account.userId))
      .limit(1);
    expect(token).toBeDefined();
    expect(token.type).toBe('activation');
  });

  it('returns 400 for a duplicate email', async () => {
    const res = await setup.agent.post('/manager/people').send({
      firstName: 'Dup', lastName: 'Staff', email: `existing-staff-${setup.estateId}@test.com`, role: 'staff',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid email', async () => {
    const res = await setup.agent.post('/manager/people').send({
      firstName: 'Bad', lastName: 'Email', email: 'not-an-email', role: 'staff',
    });
    expect(res.status).toBe(400);
  });
});

// ── GET /manager/people/:id ───────────────────────────────────────────────────

describe('GET /manager/people/:id', () => {
  it('returns 200 for a person in own estate', async () => {
    const res = await setup.agent.get(`/manager/people/${staffId}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 for a non-existent person', async () => {
    const res = await setup.agent.get('/manager/people/999999');
    expect(res.status).toBe(404);
  });
});

// ── POST /manager/people/:id/role ─────────────────────────────────────────────

describe('POST /manager/people/:id/role', () => {
  it('promotes staff to manager', async () => {
    const res = await setup.agent
      .post(`/manager/people/${staffId}/role`)
      .send({ role: 'manager' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/manager/people/${staffId}`);

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, staffId)).limit(1);
    expect(user.role).toBe('manager');
  });

  it('demotes manager to staff when another manager exists', async () => {
    // staffId is now a manager; the setup.managerId is also a manager — so demotion is allowed
    const res = await setup.agent
      .post(`/manager/people/${staffId}/role`)
      .send({ role: 'staff' });
    expect(res.status).toBe(302);
  });

  it('returns 400 for an invalid role', async () => {
    const res = await setup.agent
      .post(`/manager/people/${staffId}/role`)
      .send({ role: 'admin' });
    expect(res.status).toBe(400);
  });
});

// ── POST /manager/people/:id/deactivate ──────────────────────────────────────

describe('POST /manager/people/:id/deactivate', () => {
  it('deactivates account', async () => {
    await db.update(accountsTable).set({ active: true }).where(eq(accountsTable.userId, staffId));

    const res = await setup.agent.post(`/manager/people/${staffId}/deactivate`);
    expect(res.status).toBe(302);

    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.userId, staffId)).limit(1);
    expect(account.active).toBe(false);
  });
});

// ── POST /manager/people/:id/reactivate ──────────────────────────────────────

describe('POST /manager/people/:id/reactivate', () => {
  it('reactivates account', async () => {
    await db.update(accountsTable).set({ active: false }).where(eq(accountsTable.userId, staffId));

    const res = await setup.agent.post(`/manager/people/${staffId}/reactivate`);
    expect(res.status).toBe(302);

    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.userId, staffId)).limit(1);
    expect(account.active).toBe(true);
  });
});

// ── POST /manager/people/:id/resend-activation ───────────────────────────────

describe('POST /manager/people/:id/resend-activation', () => {
  it('regenerates activation token and redirects', async () => {
    const res = await setup.agent.post(`/manager/people/${staffId}/resend-activation`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/manager/people/${staffId}`);

    const [token] = await db
      .select().from(userAuthTokensTable)
      .where(eq(userAuthTokensTable.userId, staffId))
      .limit(1);
    expect(token).toBeDefined();
    expect(token.type).toBe('activation');
  });
});

// ── POST /manager/people/:id/delete ──────────────────────────────────────────

describe('POST /manager/people/:id/delete', () => {
  it('deletes user and redirects to /manager/people', async () => {
    const [user] = await db
      .insert(usersTable)
      .values({ firstName: 'Delete', lastName: 'Me', role: 'staff', estateId: setup.estateId })
      .returning();
    const hash = await bcrypt.hash('pass', 10);
    await db.insert(accountsTable).values({ userId: user.id, email: `delete-me-${user.id}@test.com`, password: hash, active: false });

    const res = await setup.agent.post(`/manager/people/${user.id}/delete`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/manager/people');
  });
});
