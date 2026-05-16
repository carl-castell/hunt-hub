import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import app from '@/app';
import { db } from '@/db';
import { usersTable, estatesTable } from '@/db/schema';
import { accountsTable } from '@/db/schema/accounts';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

describe('GET /login', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
  });

  it('renders email and password fields', async () => {
    const res = await request(app).get('/login');
    expect(res.text).toContain('name="email"');
    expect(res.text).toContain('name="password"');
  });

  it('includes a CSRF token field', async () => {
    const res = await request(app).get('/login');
    expect(res.text).toContain('name="_csrf"');
  });

  it('shows no error message by default', async () => {
    const res = await request(app).get('/login');
    expect(res.text).not.toContain('alert-error');
  });
});

describe('Auth Integration Tests', () => {
  const testUser = {
    email: 'auth-test@example.com',
    password: 'TestPassword123!',
    hashedPassword: '',
  };

  let testEstateId: number;
  let testUserId: number;

  beforeAll(async () => {
    testUser.hashedPassword = await bcrypt.hash(testUser.password, 10);

    const [estate] = await db
      .insert(estatesTable)
      .values({ name: 'Test Estate' })
      .returning();

    testEstateId = estate.id;

    const [user] = await db.insert(usersTable).values({
      firstName: 'Test',
      lastName:  'User',
      role:      'manager',
      estateId:  testEstateId,
    }).returning();

    testUserId = user.id;

    await db.insert(accountsTable).values({
      userId:   testUserId,
      email:    testUser.email,
      password: testUser.hashedPassword,
      active:   true,
    });
  });

  afterAll(async () => {
    await db.delete(accountsTable).where(eq(accountsTable.userId, testUserId));
    await db.delete(usersTable).where(eq(usersTable.id, testUserId));
    await db.delete(estatesTable).where(eq(estatesTable.id, testEstateId));
  });

  describe('POST /login', () => {
    it('should login successfully with correct credentials and redirect by role', async () => {
      const res = await request(app)
        .post('/login')
        .send({ email: testUser.email, password: testUser.password });
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/manager');
    });

    it('should re-render login page on wrong password with error message', async () => {
      const res = await request(app)
        .post('/login')
        .send({ email: testUser.email, password: 'WrongPassword!' });
      expect(res.status).toBe(200);
      expect(res.text).toContain('Invalid email or password');
    });

    it('should re-render login page for unknown email', async () => {
      const res = await request(app)
        .post('/login')
        .send({ email: 'nobody@example.com', password: 'whatever' });
      expect(res.status).toBe(200);
    });

    it('should re-render login page on Zod validation failure (missing fields)', async () => {
      const res = await request(app)
        .post('/login')
        .send({ email: '', password: '' });
      expect(res.status).toBe(200);
    });

    it('should re-render login page for inactive user', async () => {
      await db.update(accountsTable).set({ active: false }).where(eq(accountsTable.userId, testUserId));

      const res = await request(app)
        .post('/login')
        .send({ email: testUser.email, password: testUser.password });
      expect(res.status).toBe(200);

      await db.update(accountsTable).set({ active: true }).where(eq(accountsTable.userId, testUserId));
    });

    it('should redirect already-logged-in user away from /login', async () => {
      const agent = request.agent(app);
      await agent.post('/login').send({ email: testUser.email, password: testUser.password });
      const res = await agent.get('/login');
      expect(res.status).toBe(302);
      expect(res.headers.location).not.toBe('/login');
    });
  });

  describe('POST /logout', () => {
    it('should logout and redirect to /login', async () => {
      const agent = request.agent(app);
      await agent.post('/login').send({ email: testUser.email, password: testUser.password });
      const res = await agent.post('/logout');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login');
    });

    it('should redirect to /login even when not logged in', async () => {
      const res = await request(app).post('/logout');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login');
    });
  });

  describe('Protected routes', () => {
    it('should redirect unauthenticated user to /login', async () => {
      const res = await request(app).get('/manager');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login');
    });

    it('should allow authenticated manager to access /manager', async () => {
      const agent = request.agent(app);
      await agent.post('/login').send({ email: testUser.email, password: testUser.password });
      const res = await agent.get('/manager');
      expect(res.status).toBe(200);
    });

    it('should return 403 if manager tries to access /admin', async () => {
      const agent = request.agent(app);
      await agent.post('/login').send({ email: testUser.email, password: testUser.password });
      const res = await agent.get('/admin');
      expect(res.status).toBe(403);
    });
  });

  describe('Account lockout', () => {
    afterEach(async () => {
      await db.update(accountsTable)
        .set({ failedAttempts: 0, lockedUntil: null })
        .where(eq(accountsTable.userId, testUserId));
    });

    it('locks the account after 10 failed attempts', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app).post('/login').send({ email: testUser.email, password: 'WrongPassword!' });
      }
      const res = await request(app).post('/login').send({ email: testUser.email, password: testUser.password });
      expect(res.text).toContain('Account temporarily locked');
    });

    it('resets the counter and allows login after the lock expires', async () => {
      await db.update(accountsTable)
        .set({ failedAttempts: 10, lockedUntil: new Date(Date.now() - 1000) })
        .where(eq(accountsTable.userId, testUserId));
      const res = await request(app).post('/login').send({ email: testUser.email, password: testUser.password });
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/manager');
    });
  });
});
