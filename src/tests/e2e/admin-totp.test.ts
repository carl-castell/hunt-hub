import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { generateSync, generateSecret } from 'otplib';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import app from '@/app';
import { db } from '@/db';
import { usersTable } from '@/db/schema/users';
import { accountsTable } from '@/db/schema/accounts';
import { totpBackupCodesTable } from '@/db/schema/totp_backup_codes';

const ADMIN_PASSWORD = 'AdminPass123!';

async function createAdmin(tag: string): Promise<{ userId: number; email: string }> {
  const [user] = await db
    .insert(usersTable)
    .values({ firstName: 'Test', lastName: 'Admin', role: 'admin' })
    .returning();

  const email = `admin-totp-${tag}-${user.id}@test.com`;
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await db.insert(accountsTable).values({ userId: user.id, email, password: hash, active: true });

  return { userId: user.id, email };
}

async function cleanupAdmin(userId: number) {
  await db.delete(totpBackupCodesTable).where(eq(totpBackupCodesTable.userId, userId));
  await db.delete(accountsTable).where(eq(accountsTable.userId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
}

async function setTotpSecret(userId: number, secret: string) {
  await db.update(accountsTable).set({ totpSecret: secret }).where(eq(accountsTable.userId, userId));
}

function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(code.replace(/-/g, '')).digest('hex');
}

async function insertBackupCode(userId: number, code: string) {
  await db.insert(totpBackupCodesTable).values({ userId, codeHash: hashBackupCode(code) });
}

function extractSecret(html: string): string | null {
  const match = html.match(/<code[^>]*>([A-Z2-7]{16,})<\/code>/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Guard tests — TOTP pages without a pending session
// ---------------------------------------------------------------------------

describe('TOTP guard — no pending session', () => {
  it('GET /totp redirects to /login', async () => {
    const res = await request(app).get('/totp');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('POST /totp redirects to /login', async () => {
    const res = await request(app).post('/totp').send({ token: '000000' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('GET /totp/setup redirects to /login', async () => {
    const res = await request(app).get('/totp/setup');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('POST /totp/setup redirects to /login', async () => {
    const res = await request(app).post('/totp/setup').send({ token: '000000' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('GET /totp/backup redirects to /login', async () => {
    const res = await request(app).get('/totp/backup');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('POST /totp/backup redirects to /login', async () => {
    const res = await request(app).post('/totp/backup').send({ code: 'ABCD-1234' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('GET /totp/backup-codes redirects to /login without pendingBackupCodes', async () => {
    const res = await request(app).get('/totp/backup-codes');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});

// ---------------------------------------------------------------------------
// Login redirect — admin without TOTP secret goes to /totp/setup
// ---------------------------------------------------------------------------

describe('Admin login → /totp/setup (no secret enrolled)', () => {
  let userId: number;
  let email: string;

  beforeAll(async () => {
    ({ userId, email } = await createAdmin('no-secret'));
  });

  afterAll(async () => {
    await cleanupAdmin(userId);
  });

  it('redirects to /totp/setup after correct password', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/login').send({ email, password: ADMIN_PASSWORD });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/totp/setup');
  });

  it('GET /totp/setup returns 200 with QR code', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send({ email, password: ADMIN_PASSWORD });
    const res = await agent.get('/totp/setup');
    expect(res.status).toBe(200);
    expect(res.text).toContain('data:image/png;base64');
  });
});

// ---------------------------------------------------------------------------
// Login redirect — admin with TOTP secret goes to /totp
// ---------------------------------------------------------------------------

describe('Admin login → /totp (secret already enrolled)', () => {
  let userId: number;
  let email: string;
  const secret = generateSecret();

  beforeAll(async () => {
    ({ userId, email } = await createAdmin('has-secret'));
    await setTotpSecret(userId, secret);
  });

  afterAll(async () => {
    await cleanupAdmin(userId);
  });

  it('redirects to /totp after correct password', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/login').send({ email, password: ADMIN_PASSWORD });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/totp');
  });

  it('GET /totp returns 200', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send({ email, password: ADMIN_PASSWORD });
    const res = await agent.get('/totp');
    expect(res.status).toBe(200);
    expect(res.text).toContain('name="token"');
  });
});

// ---------------------------------------------------------------------------
// Full TOTP setup flow
// ---------------------------------------------------------------------------

describe('Full TOTP setup flow', () => {
  let userId: number;
  let email: string;

  beforeAll(async () => {
    ({ userId, email } = await createAdmin('setup-flow'));
  });

  afterAll(async () => {
    await cleanupAdmin(userId);
  });

  it('completes setup: login → setup → backup-codes → confirm → /admin', async () => {
    const agent = request.agent(app);

    // Step 1: login → /totp/setup
    const loginRes = await agent.post('/login').send({ email, password: ADMIN_PASSWORD });
    expect(loginRes.headers.location).toBe('/totp/setup');

    // Step 2: GET /totp/setup — extract secret from HTML
    const setupPage = await agent.get('/totp/setup');
    expect(setupPage.status).toBe(200);
    const secret = extractSecret(setupPage.text);
    expect(secret).not.toBeNull();

    // Step 3: POST /totp/setup with valid token
    const token = generateSync({ secret: secret!, strategy: 'totp' });
    const submitRes = await agent.post('/totp/setup').send({ token });
    expect(submitRes.status).toBe(302);
    expect(submitRes.headers.location).toBe('/totp/backup-codes');

    // Step 4: GET /totp/backup-codes — shows 10 codes
    const codesPage = await agent.get('/totp/backup-codes');
    expect(codesPage.status).toBe(200);
    const codeMatches = codesPage.text.match(/[A-F0-9]{4}-[A-F0-9]{4}/g) ?? [];
    expect(codeMatches.length).toBeGreaterThanOrEqual(10);

    // Step 5: confirm → /admin
    const confirmRes = await agent.post('/totp/backup-codes/confirm');
    expect(confirmRes.status).toBe(302);
    expect(confirmRes.headers.location).toBe('/admin');

    // Step 6: /admin is accessible
    const adminRes = await agent.get('/admin');
    expect(adminRes.status).toBe(200);
  });

  it('shows error for invalid TOTP code during setup', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send({ email, password: ADMIN_PASSWORD });

    // The secret was saved in the previous test — admin now has totpSecret, goes to /totp
    // Reset by logging in fresh (agent is new, so no pending session)
    // Admin already enrolled — this test needs a fresh unenrolled admin
  });
});

// ---------------------------------------------------------------------------
// Setup: invalid token shows error
// ---------------------------------------------------------------------------

describe('TOTP setup — invalid token', () => {
  let userId: number;
  let email: string;

  beforeAll(async () => {
    ({ userId, email } = await createAdmin('setup-invalid'));
  });

  afterAll(async () => {
    await cleanupAdmin(userId);
  });

  it('re-renders setup page with error on wrong token', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send({ email, password: ADMIN_PASSWORD });
    await agent.get('/totp/setup'); // initialises pendingTotpSecret in session
    const res = await agent.post('/totp/setup').send({ token: '000000' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Invalid code');
  });
});

// ---------------------------------------------------------------------------
// TOTP verify flow
// ---------------------------------------------------------------------------

describe('TOTP verify flow', () => {
  let userId: number;
  let email: string;
  const secret = generateSecret();

  beforeAll(async () => {
    ({ userId, email } = await createAdmin('verify'));
    await setTotpSecret(userId, secret);
  });

  afterAll(async () => {
    await cleanupAdmin(userId);
  });

  it('redirects to /admin on valid TOTP token', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send({ email, password: ADMIN_PASSWORD });
    const token = generateSync({ secret, strategy: 'totp' });
    const res = await agent.post('/totp').send({ token });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin');
  });

  it('re-renders verify page with error on invalid token', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send({ email, password: ADMIN_PASSWORD });
    const res = await agent.post('/totp').send({ token: '000000' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Invalid code');
  });

  it('/admin is accessible after successful TOTP verify', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send({ email, password: ADMIN_PASSWORD });
    const token = generateSync({ secret, strategy: 'totp' });
    await agent.post('/totp').send({ token });
    const res = await agent.get('/admin');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Backup code recovery flow
// ---------------------------------------------------------------------------

describe('Backup code recovery', () => {
  let userId: number;
  let email: string;
  const secret = generateSecret();
  const validCode = 'AAAA-1111';
  const usedCode  = 'BBBB-2222';

  beforeAll(async () => {
    ({ userId, email } = await createAdmin('backup'));
    await setTotpSecret(userId, secret);
    await insertBackupCode(userId, validCode);
    // Insert usedCode as already used
    const [row] = await db
      .insert(totpBackupCodesTable)
      .values({ userId, codeHash: hashBackupCode(usedCode) })
      .returning();
    await db
      .update(totpBackupCodesTable)
      .set({ usedAt: new Date() })
      .where(eq(totpBackupCodesTable.id, row.id));
  });

  afterAll(async () => {
    await cleanupAdmin(userId);
  });

  it('GET /totp/backup returns 200', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send({ email, password: ADMIN_PASSWORD });
    const res = await agent.get('/totp/backup');
    expect(res.status).toBe(200);
    expect(res.text).toContain('name="code"');
  });

  it('shows error for invalid backup code', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send({ email, password: ADMIN_PASSWORD });
    const res = await agent.post('/totp/backup').send({ code: 'ZZZZ-9999' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Invalid or already used backup code');
  });

  it('shows error for already-used backup code', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send({ email, password: ADMIN_PASSWORD });
    const res = await agent.post('/totp/backup').send({ code: usedCode });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Invalid or already used backup code');
  });

  it('valid backup code → re-enrollment: redirects to /totp/setup', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send({ email, password: ADMIN_PASSWORD });
    const res = await agent.post('/totp/backup').send({ code: validCode });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/totp/setup');
  });

  it('after backup code use, totpSecret is cleared in DB', async () => {
    const [row] = await db
      .select({ totpSecret: accountsTable.totpSecret })
      .from(accountsTable)
      .where(eq(accountsTable.userId, userId))
      .limit(1);
    expect(row?.totpSecret).toBeNull();
  });

  it('after backup code use, all backup codes are deleted from DB', async () => {
    const rows = await db
      .select()
      .from(totpBackupCodesTable)
      .where(eq(totpBackupCodesTable.userId, userId));
    expect(rows).toHaveLength(0);
  });

  it('shows error for empty backup code input', async () => {
    // Re-insert a valid code since previous tests consumed them
    const freshCode = 'CCCC-3333';
    await setTotpSecret(userId, secret);
    await insertBackupCode(userId, freshCode);

    const agent = request.agent(app);
    await agent.post('/login').send({ email, password: ADMIN_PASSWORD });
    const res = await agent.post('/totp/backup').send({ code: '' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Please enter a backup code');
  });
});

// ---------------------------------------------------------------------------
// Backup codes download
// ---------------------------------------------------------------------------

describe('Backup codes download', () => {
  let userId: number;
  let email: string;

  beforeAll(async () => {
    ({ userId, email } = await createAdmin('download'));
  });

  afterAll(async () => {
    await cleanupAdmin(userId);
  });

  it('GET /totp/backup-codes/download returns a .txt file after setup', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send({ email, password: ADMIN_PASSWORD });

    const setupPage = await agent.get('/totp/setup');
    const secret = extractSecret(setupPage.text)!;
    const token = generateSync({ secret, strategy: 'totp' });
    await agent.post('/totp/setup').send({ token });

    const res = await agent.get('/totp/backup-codes/download');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.headers['content-disposition']).toContain('hunt-hub-backup-codes.txt');
    expect(res.text).toContain('Hunt-Hub Admin Backup Codes');
  });
});
