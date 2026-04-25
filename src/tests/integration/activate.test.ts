import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '@/app';
import { db } from '@/db';
import { usersTable, userAuthTokensTable } from '@/db/schema';
import { accountsTable } from '@/db/schema/accounts';
import { estatesTable } from '@/db/schema/estates';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

let userId: number;
let estateId: number;
let validToken: string;
let expiredToken: string;

beforeAll(async () => {
  const [estate] = await db.insert(estatesTable).values({ name: 'Activate Test Estate' }).returning();
  estateId = estate.id;

  const [user] = await db.insert(usersTable).values({
    firstName: 'Activate', lastName: 'Test', role: 'manager', estateId: estate.id,
  }).returning();
  userId = user.id;

  // unactivated users have no password and start inactive until they complete activation
  await db.insert(accountsTable).values({
    userId: user.id, email: 'activate-test@example.com', password: null, active: false,
  });

  validToken = crypto.randomUUID();
  await db.insert(userAuthTokensTable).values({
    userId: user.id, token: validToken, type: 'activation',
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 48),
  });

  expiredToken = crypto.randomUUID();
  // set expiry 1 second in the past so it is already expired on insert
  await db.insert(userAuthTokensTable).values({
    userId: user.id, token: expiredToken, type: 'activation',
    expiresAt: new Date(Date.now() - 1000),
  });
});

afterAll(async () => {
  await db.delete(userAuthTokensTable).where(eq(userAuthTokensTable.userId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  await db.delete(estatesTable).where(eq(estatesTable.id, estateId));
});

describe('GET /activate/:token', () => {
  it('returns 200 for a valid token', async () => {
    const res = await request(app).get(`/activate/${validToken}`);
    expect(res.status).toBe(200);
  });

  it('returns 200 with error message for an unknown token', async () => {
    const res = await request(app).get('/activate/not-a-real-token');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Invalid or expired');
  });

  it('returns 200 with error message for an expired token', async () => {
    const res = await request(app).get(`/activate/${expiredToken}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('expired');
  });
});

describe('POST /activate/:token', () => {
  it('activates account, redirects to /login, and deletes the token', async () => {
    const res = await request(app)
      .post(`/activate/${validToken}`)
      .send({ password: 'NewSecurePass1!', confirmPassword: 'NewSecurePass1!' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');

    const [account] = await db
      .select().from(accountsTable).where(eq(accountsTable.userId, userId)).limit(1);
    expect(account.active).toBe(true);
    expect(account.password).not.toBeNull();

    const remaining = await db
      .select().from(userAuthTokensTable)
      .where(eq(userAuthTokensTable.token, validToken));
    expect(remaining).toHaveLength(0);
  });

  it('re-renders with error when passwords do not match', async () => {
    const token = crypto.randomUUID();
    await db.insert(userAuthTokensTable).values({
      userId, token, type: 'activation', expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    const res = await request(app)
      .post(`/activate/${token}`)
      .send({ password: 'Password1!', confirmPassword: 'Different1!' });
    expect(res.status).toBe(200);
  });

  it('re-renders with error when password is too short', async () => {
    const token = crypto.randomUUID();
    await db.insert(userAuthTokensTable).values({
      userId, token, type: 'activation', expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    const res = await request(app)
      .post(`/activate/${token}`)
      .send({ password: 'short', confirmPassword: 'short' });
    expect(res.status).toBe(200);
  });

  it('re-renders with error for an expired token', async () => {
    const res = await request(app)
      .post(`/activate/${expiredToken}`)
      .send({ password: 'ValidPass1!', confirmPassword: 'ValidPass1!' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('expired');
  });

  it('re-renders with error for an unknown token', async () => {
    const res = await request(app)
      .post('/activate/not-a-real-token')
      .send({ password: 'ValidPass1!', confirmPassword: 'ValidPass1!' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Invalid or expired');
  });
});
