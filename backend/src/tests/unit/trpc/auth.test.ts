import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/trpc/trpc';
import type { Context } from '@/trpc/context';

const { mockDb, mockBcryptCompare, mockBcryptHash, MockTOTP, MockSecret } = vi.hoisted(() => {
  const mockTOTPInstance = { validate: vi.fn().mockReturnValue(0), toString: vi.fn().mockReturnValue('otpauth://totp/mock') };
  const MockTOTP = vi.fn().mockImplementation(function() { return mockTOTPInstance; });
  const MockSecret = vi.fn().mockImplementation(() => ({ base32: 'MOCKSECRET32' }));
  (MockSecret as any).fromBase32 = vi.fn().mockReturnValue({});
  return {
    mockDb: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    },
    mockBcryptCompare: vi.fn(),
    mockBcryptHash: vi.fn().mockResolvedValue('hashed'),
    MockTOTP,
    MockSecret,
  };
});

vi.mock('@/db', () => ({ db: mockDb }));
vi.mock('@/services/audit', () => ({ audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('bcrypt', () => ({ default: { compare: mockBcryptCompare, hash: mockBcryptHash } }));
vi.mock('otpauth', () => ({ TOTP: MockTOTP, Secret: MockSecret }));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mock') } }));

import { appRouter } from '@/trpc/router';

const createCaller = createCallerFactory(appRouter);

const loggedInUser = { id: 1, role: 'manager' as const, estateId: 5, firstName: 'Jane', lastName: 'Smith', email: 'jane@test.com', active: true };

function mockSession(overrides: any = {}) {
  return {
    user: undefined as any,
    pendingAdminId: undefined as number | undefined,
    pendingAdminExpires: undefined as number | undefined,
    pendingTotpSecret: undefined as string | undefined,
    pendingBackupCodes: undefined as string[] | undefined,
    regenerate: vi.fn().mockImplementation((cb: any) => cb(null)),
    save: vi.fn().mockImplementation((cb: any) => cb(null)),
    destroy: vi.fn().mockImplementation((cb: any) => cb()),
    ...overrides,
  };
}

function mockCtx(overrides: Partial<Context> = {}): Context {
  const session = mockSession();
  return { user: null, ip: '127.0.0.1', req: { session } as any, res: {} as any, session: session as any, ...overrides };
}

function mockCtxWithPending(userId = 1): Context {
  const session = mockSession({ pendingAdminId: userId });
  return { user: null, ip: '127.0.0.1', req: { session } as any, res: {} as any, session: session as any };
}

const fakeAccountRow = {
  accounts: { email: 'jane@test.com', password: 'hashed', active: true, lockedUntil: null, failedAttempts: 0, totpSecret: null, userId: 1 },
  users: { id: 1, firstName: 'Jane', lastName: 'Smith', role: 'manager' as const, estateId: 5 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.innerJoin.mockReturnThis();
  mockDb.where.mockReturnThis();
  mockDb.update.mockReturnThis();
  mockDb.set.mockReturnThis();
  mockDb.insert.mockReturnThis();
  mockDb.values.mockReturnThis();
  mockDb.delete.mockReturnThis();
  mockBcryptHash.mockResolvedValue('hashed');
  MockTOTP.mockImplementation(function() { return { validate: vi.fn().mockReturnValue(0), toString: vi.fn().mockReturnValue('otpauth://totp/mock') }; });
});

describe('auth.me', () => {
  it('returns the logged-in user', () => {
    const ctx = mockCtx({ user: loggedInUser });
    expect(createCaller(ctx).auth.me()).resolves.toEqual(loggedInUser);
  });

  it('returns null when no user is in session', () => {
    expect(createCaller(mockCtx()).auth.me()).resolves.toBeNull();
  });
});

describe('auth.login', () => {
  it('throws UNAUTHORIZED when the user is not found', async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    await expect(createCaller(mockCtx()).auth.login({ email: 'x@x.com', password: 'pass' }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('throws UNAUTHORIZED when the account is inactive', async () => {
    mockDb.limit.mockResolvedValueOnce([{
      ...fakeAccountRow,
      accounts: { ...fakeAccountRow.accounts, active: false },
    }]);

    await expect(createCaller(mockCtx()).auth.login({ email: 'jane@test.com', password: 'pass' }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('throws UNAUTHORIZED when the password is wrong', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeAccountRow]);
    mockBcryptCompare.mockResolvedValueOnce(false);

    await expect(createCaller(mockCtx()).auth.login({ email: 'jane@test.com', password: 'wrong' }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('throws TOO_MANY_REQUESTS when the account is locked', async () => {
    const lockedUntil = new Date(Date.now() + 60_000);
    mockDb.limit.mockResolvedValueOnce([{
      ...fakeAccountRow,
      accounts: { ...fakeAccountRow.accounts, lockedUntil },
    }]);

    await expect(createCaller(mockCtx()).auth.login({ email: 'jane@test.com', password: 'pass' }))
      .rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });

  it('logs in a manager directly and returns requiresTotp: false', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeAccountRow]);
    mockBcryptCompare.mockResolvedValueOnce(true);

    const result = await createCaller(mockCtx()).auth.login({ email: 'jane@test.com', password: 'pass' });

    expect(result.requiresTotp).toBe(false);
    expect(result.user?.email).toBe('jane@test.com');
  });

  it('returns requiresTotp: true for an admin user', async () => {
    mockDb.limit.mockResolvedValueOnce([{
      ...fakeAccountRow,
      users: { ...fakeAccountRow.users, role: 'admin' as const },
    }]);
    mockBcryptCompare.mockResolvedValueOnce(true);

    const result = await createCaller(mockCtx()).auth.login({ email: 'jane@test.com', password: 'pass' });

    expect(result.requiresTotp).toBe(true);
    expect(result.user).toBeNull();
  });
});

describe('auth.verifyTotp', () => {
  it('throws UNAUTHORIZED when there is no pending session', async () => {
    await expect(createCaller(mockCtx()).auth.verifyTotp({ token: '123456' }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('throws UNAUTHORIZED when the token is invalid', async () => {
    MockTOTP.mockImplementationOnce(function() { return { validate: vi.fn().mockReturnValue(null) }; });
    mockDb.limit.mockResolvedValueOnce([{ totpSecret: 'SECRET' }]);

    await expect(createCaller(mockCtxWithPending()).auth.verifyTotp({ token: '000000' }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('completes login and returns session user on valid token', async () => {
    mockDb.limit.mockResolvedValueOnce([{ totpSecret: 'SECRET' }]);
    mockDb.limit.mockResolvedValueOnce([{
      accounts: { email: 'admin@test.com', active: true, userId: 1 },
      users: { id: 1, firstName: 'Admin', lastName: 'User', role: 'admin', estateId: null },
    }]);

    const result = await createCaller(mockCtxWithPending()).auth.verifyTotp({ token: '123456' });

    expect(result.email).toBe('admin@test.com');
  });
});

describe('auth.logout', () => {
  it('destroys the session and returns ok', async () => {
    const result = await createCaller(mockCtx({ user: loggedInUser })).auth.logout();

    expect(result).toEqual({ ok: true });
  });
});
