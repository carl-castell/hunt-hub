import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/trpc/trpc';
import type { Context } from '@/trpc/context';

const { mockDb, mockBcryptCompare, mockBcryptHash, mockIsPasswordPwned } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
  mockBcryptCompare: vi.fn(),
  mockBcryptHash: vi.fn().mockResolvedValue('newhash'),
  mockIsPasswordPwned: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/db', () => ({ db: mockDb }));
vi.mock('@/services/audit', () => ({ audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/services/hibp', () => ({ isPasswordPwned: mockIsPasswordPwned }));
vi.mock('@/app', () => ({ sessionPool: { query: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('bcrypt', () => ({ default: { compare: mockBcryptCompare, hash: mockBcryptHash } }));

import { appRouter } from '@/trpc/router';

const createCaller = createCallerFactory(appRouter);

const adminUser = { id: 1, role: 'admin' as const, estateId: null, firstName: 'Admin', lastName: 'User', email: 'admin@test.com', active: true };

function mockCtx(overrides: Partial<Context> = {}): Context {
  return { user: adminUser, ip: '127.0.0.1', req: {} as any, res: {} as any, session: {} as any, ...overrides };
}

const validPasswordInput = { oldPassword: 'OldPass1!', newPassword: 'NewPass1!', confirmPassword: 'NewPass1!' };

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.where.mockReturnThis();
  mockDb.update.mockReturnThis();
  mockDb.set.mockReturnThis();
  mockBcryptHash.mockResolvedValue('newhash');
  mockIsPasswordPwned.mockResolvedValue(false);
});

describe('admin.account.get', () => {
  it('returns the account info when found', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 1, firstName: 'Admin', lastName: 'User', role: 'admin' }]);
    mockDb.limit.mockResolvedValueOnce([{ email: 'admin@test.com' }]);

    const result = await createCaller(mockCtx()).admin.account.get();

    expect(result.firstName).toBe('Admin');
    expect(result.email).toBe('admin@test.com');
  });

  it('throws NOT_FOUND when user or account is missing', async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    mockDb.limit.mockResolvedValueOnce([]);

    await expect(createCaller(mockCtx()).admin.account.get())
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('admin.account.changePassword', () => {
  it('changes the password and returns ok', async () => {
    mockDb.limit.mockResolvedValueOnce([{ password: 'oldhash', userId: 1 }]);
    mockBcryptCompare.mockResolvedValueOnce(true);

    const result = await createCaller(mockCtx()).admin.account.changePassword(validPasswordInput);

    expect(mockDb.update).toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it('throws BAD_REQUEST when the account has no password', async () => {
    mockDb.limit.mockResolvedValueOnce([{ password: null, userId: 1 }]);

    await expect(createCaller(mockCtx()).admin.account.changePassword(validPasswordInput))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws UNAUTHORIZED when the old password is incorrect', async () => {
    mockDb.limit.mockResolvedValueOnce([{ password: 'oldhash', userId: 1 }]);
    mockBcryptCompare.mockResolvedValueOnce(false);

    await expect(createCaller(mockCtx()).admin.account.changePassword(validPasswordInput))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('throws BAD_REQUEST when the new password has been pwned', async () => {
    mockDb.limit.mockResolvedValueOnce([{ password: 'oldhash', userId: 1 }]);
    mockBcryptCompare.mockResolvedValueOnce(true);
    mockIsPasswordPwned.mockResolvedValueOnce(true);

    await expect(createCaller(mockCtx()).admin.account.changePassword(validPasswordInput))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
