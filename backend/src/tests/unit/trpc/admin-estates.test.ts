import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { createCallerFactory } from '@/trpc/trpc';

const { mockDb, mockTx } = vi.hoisted(() => {
  const mockTx = {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    delete: vi.fn().mockReturnThis(),
    where: vi.fn(),
  };
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    orderBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    transaction: vi.fn().mockImplementation(async (cb: any) => cb(mockTx)),
  };
  return { mockDb, mockTx };
});

vi.mock('@/db', () => ({ db: mockDb }));
vi.mock('@/services/audit', () => ({ audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/services/mail', () => ({
  renderTemplate: vi.fn().mockResolvedValue('<html>'),
  sendMail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/utils/url', () => ({ getBaseUrl: vi.fn().mockReturnValue('https://example.com') }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import { appRouter } from '@/trpc/router';
import type { Context } from '@/trpc/context';

const createCaller = createCallerFactory(appRouter);

const adminUser = {
  id: 1,
  role: 'admin' as const,
  estateId: null,
  firstName: 'Admin',
  lastName: 'User',
  email: 'admin@test.com',
  active: true,
};

function mockCtx(overrides: Partial<Context> = {}): Context {
  return {
    user: adminUser,
    ip: '127.0.0.1',
    req: {} as any,
    res: {} as any,
    session: {} as any,
    ...overrides,
  };
}

const fakeEstate = { id: 5, name: 'Test Estate' };

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.innerJoin.mockReturnThis();
  mockDb.leftJoin.mockReturnThis();
  mockDb.where.mockReturnThis();
  mockDb.orderBy.mockReturnThis();
  mockDb.insert.mockReturnThis();
  mockDb.values.mockReturnThis();
  mockDb.update.mockReturnThis();
  mockDb.set.mockReturnThis();
  mockDb.delete.mockReturnThis();
  mockDb.transaction.mockImplementation(async (cb: any) => cb(mockTx));
  mockTx.insert.mockReturnThis();
  mockTx.values.mockReturnThis();
  mockTx.delete.mockReturnThis();
});

// ---------------------------------------------------------------------------
// admin.estates.list
// ---------------------------------------------------------------------------

describe('admin.estates.list', () => {
  it('returns the list of estates', async () => {
    mockDb.orderBy.mockResolvedValueOnce([fakeEstate]);
    const caller = createCaller(mockCtx());

    const result = await caller.admin.estates.list();

    expect(result).toEqual([fakeEstate]);
  });

  it('throws UNAUTHORIZED when there is no logged-in user', async () => {
    const caller = createCaller(mockCtx({ user: null }));

    await expect(caller.admin.estates.list()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('throws FORBIDDEN when the user is not an admin', async () => {
    const caller = createCaller(mockCtx({ user: { ...adminUser, role: 'manager' } }));

    await expect(caller.admin.estates.list()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

// ---------------------------------------------------------------------------
// admin.estates.get
// ---------------------------------------------------------------------------

describe('admin.estates.get', () => {
  it('returns the estate and its managers when found', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeEstate]);
    const caller = createCaller(mockCtx());

    const result = await caller.admin.estates.get({ id: 5 });

    expect(result.estate).toEqual(fakeEstate);
  });

  it('throws NOT_FOUND when the estate does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const caller = createCaller(mockCtx());

    await expect(caller.admin.estates.get({ id: 99 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ---------------------------------------------------------------------------
// admin.estates.create
// ---------------------------------------------------------------------------

describe('admin.estates.create', () => {
  it('inserts the estate and returns it', async () => {
    mockDb.returning.mockResolvedValueOnce([fakeEstate]);
    const caller = createCaller(mockCtx());

    const result = await caller.admin.estates.create({ name: 'Test Estate' });

    expect(mockDb.insert).toHaveBeenCalled();
    expect(result).toEqual(fakeEstate);
  });
});

// ---------------------------------------------------------------------------
// admin.estates.rename
// ---------------------------------------------------------------------------

describe('admin.estates.rename', () => {
  it('updates the name and returns the estate', async () => {
    const renamed = { ...fakeEstate, name: 'Renamed' };
    mockDb.returning.mockResolvedValueOnce([renamed]);
    const caller = createCaller(mockCtx());

    const result = await caller.admin.estates.rename({ id: 5, name: 'Renamed' });

    expect(mockDb.update).toHaveBeenCalled();
    expect(result).toEqual(renamed);
  });

  it('throws NOT_FOUND when the estate does not exist', async () => {
    mockDb.returning.mockResolvedValueOnce([]);
    const caller = createCaller(mockCtx());

    await expect(caller.admin.estates.rename({ id: 99, name: 'X' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ---------------------------------------------------------------------------
// admin.estates.delete
// ---------------------------------------------------------------------------

describe('admin.estates.delete', () => {
  it('runs a transaction deleting users then the estate and returns ok', async () => {
    const caller = createCaller(mockCtx());

    const result = await caller.admin.estates.delete({ id: 5 });

    expect(mockDb.transaction).toHaveBeenCalled();
    expect(mockTx.delete).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// admin.estates.addManager
// ---------------------------------------------------------------------------

describe('admin.estates.addManager', () => {
  it('runs the transaction, sends the activation email and returns ok', async () => {
    mockTx.returning.mockResolvedValueOnce([{ id: 42 }]);
    const caller = createCaller(mockCtx());

    const result = await caller.admin.estates.addManager({
      estateId: 5,
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
    });

    expect(mockDb.transaction).toHaveBeenCalled();
    expect(mockTx.insert).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ ok: true });
  });

  it('still returns ok when the activation email fails to send', async () => {
    const { sendMail } = await import('@/services/mail');
    vi.mocked(sendMail).mockRejectedValueOnce(new Error('SMTP error'));
    mockTx.returning.mockResolvedValueOnce([{ id: 42 }]);
    const caller = createCaller(mockCtx());

    const result = await caller.admin.estates.addManager({
      estateId: 5,
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
    });

    expect(result).toEqual({ ok: true });
  });
});
