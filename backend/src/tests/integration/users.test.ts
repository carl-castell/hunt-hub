import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '@/app';
import { db } from '@/db';
import { usersTable, userAuthTokensTable, estatesTable } from '@/db/schema';
import { accountsTable } from '@/db/schema/accounts';
import { eq, inArray } from 'drizzle-orm';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

async function loginAs(role: 'admin' | 'manager' | 'staff') {
  const agent = request.agent(app);
  const credentials = {
    admin:   { email: 'admin@test.com',   password: 'adminpass123'   },
    manager: { email: 'manager@test.com', password: 'managerpass123' },
    staff:   { email: 'staff@test.com',   password: 'staffpass123'   },
  };
  await agent.post('/login').send(credentials[role]);
  return agent;
}

let adminId: number;
let managerId: number;
let staffId: number;
let estateId: number;

beforeAll(async () => {
  const adminHash   = await bcrypt.hash('adminpass123',   10);
  const managerHash = await bcrypt.hash('managerpass123', 10);
  const staffHash   = await bcrypt.hash('staffpass123',   10);

  const [admin] = await db.insert(usersTable).values({
    firstName: 'Admin', lastName: 'User', role: 'admin', estateId: null,
  }).returning();
  adminId = admin.id;
  await db.insert(accountsTable).values({
    userId: adminId, email: 'admin@test.com', password: adminHash, active: true,
  });

  const [estate] = await db.insert(estatesTable).values({ name: 'Test Estate' }).returning();
  estateId = estate.id;

  const [manager] = await db.insert(usersTable).values({
    firstName: 'Manager', lastName: 'User', role: 'manager', estateId,
  }).returning();
  managerId = manager.id;
  await db.insert(accountsTable).values({
    userId: managerId, email: 'manager@test.com', password: managerHash, active: true,
  });

  const [staff] = await db.insert(usersTable).values({
    firstName: 'Staff', lastName: 'User', role: 'staff', estateId,
  }).returning();
  staffId = staff.id;
  await db.insert(accountsTable).values({
    userId: staffId, email: 'staff@test.com', password: staffHash, active: true,
  });
});

afterAll(async () => {
  // delete tokens before users to avoid FK violation (userAuthTokens → usersTable)
  await db.delete(userAuthTokensTable).where(
    inArray(userAuthTokensTable.userId, [adminId, managerId, staffId]),
  );
  await db.delete(usersTable).where(eq(usersTable.id, adminId));
  await db.delete(usersTable).where(eq(usersTable.id, managerId));
  await db.delete(usersTable).where(eq(usersTable.id, staffId));
  await db.delete(estatesTable).where(eq(estatesTable.id, estateId));
});

describe('GET /users/:id', () => {
  it('returns 200 for admin viewing any user', async () => {
    const agent = await loginAs('admin');
    const res = await agent.get(`/users/${managerId}`);
    expect(res.status).toBe(200);
  });

  it('returns 200 for manager viewing a user in their estate', async () => {
    const agent = await loginAs('manager');
    const res = await agent.get(`/users/${staffId}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 for a non-existent user', async () => {
    const agent = await loginAs('admin');
    const res = await agent.get('/users/999999');
    expect(res.status).toBe(404);
  });

  it('redirects to /login when not logged in', async () => {
    const res = await request(app).get(`/users/${managerId}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});

describe('POST /users/:id/update', () => {
  it('updates user details successfully', async () => {
    const agent = await loginAs('admin');
    const res = await agent.post(`/users/${staffId}/update`).send({
      firstName: 'Updated', lastName: 'Name', email: 'updated@test.com',
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/users/${staffId}`);

    // revert so loginAs('staff') still works in subsequent tests
    await db.update(usersTable)
      .set({ firstName: 'Staff', lastName: 'User' })
      .where(eq(usersTable.id, staffId));
    await db.update(accountsTable)
      .set({ email: 'staff@test.com' })
      .where(eq(accountsTable.userId, staffId));
  });

  it('returns 400 for invalid data', async () => {
    const agent = await loginAs('admin');
    const res = await agent.post(`/users/${staffId}/update`).send({
      firstName: '', lastName: '', email: 'not-an-email',
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent user', async () => {
    const agent = await loginAs('admin');
    const res = await agent.post('/users/999999/update').send({
      firstName: 'Ghost', lastName: 'User', email: 'ghost@test.com',
    });
    expect(res.status).toBe(404);
  });

  it('redirects to /login when not logged in', async () => {
    const res = await request(app).post(`/users/${staffId}/update`).send({
      firstName: 'Test', lastName: 'User', email: 'test@test.com',
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});

describe('POST /users/:id/deactivate', () => {
  it('deactivates a user successfully', async () => {
    const agent = await loginAs('admin');
    const res = await agent.post(`/users/${staffId}/deactivate`);
    expect(res.status).toBe(302);

    // active lives on accountsTable, not usersTable
    const [account] = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.userId, staffId))
      .limit(1);
    expect(account.active).toBe(false);

    // revert so loginAs('staff') still works in subsequent tests
    await db.update(accountsTable)
      .set({ active: true })
      .where(eq(accountsTable.userId, staffId));
  });

  it('returns 404 for non-existent user', async () => {
    const agent = await loginAs('admin');
    const res = await agent.post('/users/999999/deactivate');
    expect(res.status).toBe(404);
  });

  it('redirects to /login when not logged in', async () => {
    const res = await request(app).post(`/users/${staffId}/deactivate`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});

describe('POST /users/:id/reactivate', () => {
  it('reactivates a user successfully', async () => {
    // Pre-condition: deactivate via accountsTable
    await db.update(accountsTable)
      .set({ active: false })
      .where(eq(accountsTable.userId, staffId));

    const agent = await loginAs('admin');
    const res = await agent.post(`/users/${staffId}/reactivate`);
    expect(res.status).toBe(302);

    // active lives on accountsTable
    const [account] = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.userId, staffId))
      .limit(1);
    expect(account.active).toBe(true);
  });

  it('returns 404 for non-existent user', async () => {
    const agent = await loginAs('admin');
    const res = await agent.post('/users/999999/reactivate');
    expect(res.status).toBe(404);
  });

  it('redirects to /login when not logged in', async () => {
    const res = await request(app).post(`/users/${staffId}/reactivate`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});

describe('POST /users/:id/delete', () => {
  it('admin deletes a user with estateId and redirects to estate page', async () => {
    const [tempUser] = await db.insert(usersTable).values({
      firstName: 'Temp', lastName: 'User', role: 'staff', estateId,
    }).returning();
    // password must be non-null (accountsTable constraint); use a placeholder hash
    const hash = await bcrypt.hash('temppass', 10);
    await db.insert(accountsTable).values({
      userId: tempUser.id, email: 'temp@test.com', password: hash, active: true,
    });

    const agent = await loginAs('admin');
    const res = await agent.post(`/users/${tempUser.id}/delete`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/admin/estates/${estateId}`);
    // cascade deletes accountsTable row automatically
  });

  it('admin deletes another admin (null estateId) and redirects to /admin', async () => {
    const [tempAdmin] = await db.insert(usersTable).values({
      firstName: 'Temp', lastName: 'Admin', role: 'admin', estateId: null,
    }).returning();
    const hash = await bcrypt.hash('temppass', 10);
    await db.insert(accountsTable).values({
      userId: tempAdmin.id, email: 'tempadmin@test.com', password: hash, active: true,
    });

    const agent = await loginAs('admin');
    const res = await agent.post(`/users/${tempAdmin.id}/delete`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin');
  });

  it('returns 404 for non-existent user', async () => {
    const agent = await loginAs('admin');
    const res = await agent.post('/users/999999/delete');
    expect(res.status).toBe(404);
  });

  it('redirects to /login when not logged in', async () => {
    const res = await request(app).post(`/users/${staffId}/delete`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});

describe('POST /users/:id/resend-activation', () => {
  it('generates a new activation token and redirects', async () => {
    const agent = await loginAs('admin');
    const res = await agent.post(`/users/${staffId}/resend-activation`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/users/${staffId}`);

    const [token] = await db
      .select()
      .from(userAuthTokensTable)
      .where(eq(userAuthTokensTable.userId, staffId))
      .limit(1);

    expect(token).toBeDefined();
    expect(token.type).toBe('activation');
  });

  it('replaces existing token with a new one', async () => {
    await db.insert(userAuthTokensTable).values({
      userId:    staffId,
      token:     crypto.randomUUID(),
      type:      'activation',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    const agent = await loginAs('admin');
    await agent.post(`/users/${staffId}/resend-activation`);

    const tokens = await db
      .select()
      .from(userAuthTokensTable)
      .where(eq(userAuthTokensTable.userId, staffId));

    expect(tokens.length).toBe(1);
  });

  it('redirects to /login when not logged in', async () => {
    const res = await request(app).post(`/users/${staffId}/resend-activation`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});
