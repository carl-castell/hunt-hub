import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { TOTP, Secret } from 'otpauth';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import app from '@/app';
import { db } from '@/db';
import { usersTable, userAuthTokensTable } from '@/db/schema';
import { accountsTable } from '@/db/schema/accounts';
import { estatesTable } from '@/db/schema/estates';

vi.mock('@/services/mail', () => ({
  renderTemplate: vi.fn().mockResolvedValue('<html>activation</html>'),
  sendMail: vi.fn().mockResolvedValue(undefined),
  default: {},
}));

const ADMIN_PASSWORD = 'AdminOnboard123!';
const MANAGER_EMAIL = 'new-manager-onboard@e2e.test';
const MANAGER_PASSWORD = 'ManagerOnboard123!';

let adminId: number;
let estateId: number;

async function setupAdmin(): Promise<ReturnType<typeof request.agent>> {
  const [user] = await db
    .insert(usersTable)
    .values({ firstName: 'Onboard', lastName: 'Admin', role: 'admin' })
    .returning();
  adminId = user.id;

  const email = `admin-onboard-${user.id}@e2e.test`;
  const secret = new Secret().base32;
  await db.insert(accountsTable).values({
    userId: user.id,
    email,
    password: await bcrypt.hash(ADMIN_PASSWORD, 10),
    active: true,
    totpSecret: secret,
  });

  const agent = request.agent(app);
  await agent.post('/login').send({ email, password: ADMIN_PASSWORD });
  const token = new TOTP({ secret: Secret.fromBase32(secret) }).generate();
  await agent.post('/totp').send({ token });
  return agent;
}

describe('Admin onboarding: estate creation → manager activation → manager login', () => {
  let adminAgent: ReturnType<typeof request.agent>;
  let activationToken: string;

  beforeAll(async () => {
    adminAgent = await setupAdmin();
  });

  afterAll(async () => {
    if (estateId) {
      const estateUsers = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.estateId, estateId));
      for (const u of estateUsers) {
        await db.delete(userAuthTokensTable).where(eq(userAuthTokensTable.userId, u.id));
        await db.delete(accountsTable).where(eq(accountsTable.userId, u.id));
      }
      await db.delete(usersTable).where(eq(usersTable.estateId, estateId));
      await db.delete(estatesTable).where(eq(estatesTable.id, estateId));
    }
    await db.delete(accountsTable).where(eq(accountsTable.userId, adminId));
    await db.delete(usersTable).where(eq(usersTable.id, adminId));
  });

  it('admin creates an estate and lands on the estate page', async () => {
    const res = await adminAgent.post('/admin/estates').send({ name: 'Onboarding E2E Estate' });
    expect(res.status).toBe(302);
    const match = res.headers.location?.match(/\/admin\/estates\/(\d+)/);
    expect(match).not.toBeNull();
    estateId = Number(match![1]);

    const page = await adminAgent.get(`/admin/estates/${estateId}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain('Onboarding E2E Estate');
  });

  it('admin adds a manager and triggers an activation email', async () => {
    const { sendMail } = await import('@/services/mail');

    const res = await adminAgent.post('/users/managers').send({
      firstName: 'New',
      lastName: 'Manager',
      email: MANAGER_EMAIL,
      estateId: String(estateId),
    });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/admin/estates/${estateId}`);
    expect(vi.mocked(sendMail)).toHaveBeenCalledWith(
      expect.objectContaining({ to: MANAGER_EMAIL }),
    );

    const [account] = await db
      .select({ userId: accountsTable.userId })
      .from(accountsTable)
      .where(eq(accountsTable.email, MANAGER_EMAIL))
      .limit(1);

    const [tokenRow] = await db
      .select({ token: userAuthTokensTable.token })
      .from(userAuthTokensTable)
      .where(eq(userAuthTokensTable.userId, account.userId))
      .limit(1);

    activationToken = tokenRow.token;
    expect(activationToken).toBeDefined();
  });

  it('manager activates their account via the link', async () => {
    const res = await request(app)
      .post(`/activate/${activationToken}`)
      .send({ password: MANAGER_PASSWORD, confirmPassword: MANAGER_PASSWORD });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('manager can log in with the new password and reaches /manager', async () => {
    const res = await request.agent(app)
      .post('/login')
      .send({ email: MANAGER_EMAIL, password: MANAGER_PASSWORD });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/manager');
  });
});
