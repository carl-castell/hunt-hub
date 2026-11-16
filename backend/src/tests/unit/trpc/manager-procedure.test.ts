import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/trpc/trpc';

const { mockDb, mockGetUserAccess } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
  },
  mockGetUserAccess: vi.fn(),
}));

vi.mock('@/db', () => ({ db: mockDb }));
vi.mock('@/services/userAccess', () => ({ getUserAccess: mockGetUserAccess }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import { appRouter } from '@/trpc/router';
import type { Context } from '@/trpc/context';

const createCaller = createCallerFactory(appRouter);

const sessionManager = {
  id: 7,
  role: 'manager' as const,
  estateId: 5,
  firstName: 'Mia',
  lastName: 'Manager',
  email: 'mia@test.com',
  active: true,
};

function mockCtx(overrides: Partial<Context> = {}): Context {
  return {
    user: sessionManager,
    ip: '127.0.0.1',
    req: {} as any,
    res: {} as any,
    session: {} as any,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.where.mockReturnThis();
});

describe('managerProcedure access check', () => {
  it('throws UNAUTHORIZED when nobody is logged in', async () => {
    const caller = createCaller(mockCtx({ user: null }));

    await expect(caller.manager.estate.get()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(mockGetUserAccess).not.toHaveBeenCalled();
  });

  it.each([
    ['an admin', { role: 'admin', estateId: null, active: true }],
    ['a staff member', { role: 'staff', estateId: 5, active: true }],
    ['a deactivated manager', { role: 'manager', estateId: 5, active: false }],
    ['a manager without estate', { role: 'manager', estateId: null, active: true }],
  ])('throws FORBIDDEN for %s', async (_label, access) => {
    mockGetUserAccess.mockResolvedValueOnce(access);
    const caller = createCaller(mockCtx());

    await expect(caller.manager.estate.get()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws FORBIDDEN when the user no longer exists', async () => {
    mockGetUserAccess.mockResolvedValueOnce(null);
    const caller = createCaller(mockCtx());

    await expect(caller.manager.estate.get()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('uses the role from the database, not the one stored in the session', async () => {
    // Session still says "manager", but the user was changed to staff since login.
    mockGetUserAccess.mockResolvedValueOnce({ role: 'staff', estateId: 5, active: true });
    const caller = createCaller(mockCtx());

    await expect(caller.manager.estate.get()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mockGetUserAccess).toHaveBeenCalledWith(7);
  });
});

describe('manager.estate.get', () => {
  it("returns the manager's own estate with its area count", async () => {
    mockGetUserAccess.mockResolvedValueOnce({ role: 'manager', estateId: 5, active: true });
    mockDb.limit.mockResolvedValueOnce([{ id: 5, name: 'Test Estate' }]);
    mockDb.where
      .mockReturnValueOnce(mockDb) // estate query continues with .limit()
      .mockResolvedValueOnce([{ areaCount: 3 }]); // area count query ends at .where()
    const caller = createCaller(mockCtx());

    const result = await caller.manager.estate.get();

    expect(result).toEqual({ id: 5, name: 'Test Estate', areaCount: 3 });
  });

  it('scopes to the estate from the database, even if the session holds another one', async () => {
    mockGetUserAccess.mockResolvedValueOnce({ role: 'manager', estateId: 9, active: true });
    mockDb.limit.mockResolvedValueOnce([{ id: 9, name: 'Other Estate' }]);
    mockDb.where.mockReturnValueOnce(mockDb).mockResolvedValueOnce([{ areaCount: 0 }]);
    const caller = createCaller(mockCtx()); // session says estate 5

    const result = await caller.manager.estate.get();

    expect(result.id).toBe(9);
  });

  it('throws NOT_FOUND when the estate does not exist', async () => {
    mockGetUserAccess.mockResolvedValueOnce({ role: 'manager', estateId: 5, active: true });
    mockDb.limit.mockResolvedValueOnce([]);
    const caller = createCaller(mockCtx());

    await expect(caller.manager.estate.get()).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
