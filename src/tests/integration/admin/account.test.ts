import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import app from '@/app';
import { db } from '@/db';
import { usersTable } from '@/db/schema/users';
import { accountsTable } from '@/db/schema/accounts';

const ADMIN_PASSWORD = 'AdminTestPass1!';

let adminId: number;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const [admin] = await db
    .insert(usersTable)
    .values({ firstName: 'Test', lastName: 'Admin', role: 'admin' })
    .returning();
  adminId = admin.id;

  const email = `admin-account-${admin.id}@test.com`;
  await db.insert(accountsTable).values({
    userId: admin.id, email, password: await bcrypt.hash(ADMIN_PASSWORD, 10), active: true,
  });

  agent = request.agent(app);
  await agent.post('/login').send({ email, password: ADMIN_PASSWORD });
});

afterAll(async () => {
  await db.delete(usersTable).where(eq(usersTable.id, adminId));
});

describe('POST /admin/account/password', () => {
  it('rejects a pwned new password with a breach error message', async () => {
    // SHA-1('password') suffix after the 5-char prefix
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:5', { status: 200 }),
    );

    const res = await agent
      .post('/admin/account/password')
      .send({ oldPassword: ADMIN_PASSWORD, newPassword: 'password', confirmPassword: 'password' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('known data breach');

    vi.restoreAllMocks();
  });
});
