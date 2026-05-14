import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/trpc/trpc';
import type { Context } from '@/trpc/context';

const { mockDb, mockTx } = vi.hoisted(() => {
  const mockTx = {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
  };
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn(),
    transaction: vi.fn().mockImplementation(async (cb: any) => cb(mockTx)),
  };
  return { mockDb, mockTx };
});

vi.mock('@/db', () => ({ db: mockDb }));
vi.mock('@/services/audit', () => ({ audit: vi.fn().mockResolvedValue(undefined) }));

import { appRouter } from '@/trpc/router';

const createCaller = createCallerFactory(appRouter);

const adminUser = { id: 1, role: 'admin' as const, estateId: null, firstName: 'A', lastName: 'B', email: 'a@b.com', active: true };

function mockCtx(overrides: Partial<Context> = {}): Context {
  return { user: adminUser, ip: '127.0.0.1', req: {} as any, res: {} as any, session: {} as any, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.innerJoin.mockReturnThis();
  mockDb.where.mockReturnThis();
  mockDb.transaction.mockImplementation(async (cb: any) => cb(mockTx));
  mockTx.insert.mockReturnThis();
  mockTx.values.mockReturnThis();
});

describe('admin.settings.listAdmins', () => {
  it('returns list of admins', async () => {
    mockDb.orderBy.mockResolvedValueOnce([{ id: 1, firstName: 'Carl', email: 'carl@test.com', active: true }]);

    const result = await createCaller(mockCtx()).admin.settings.listAdmins();

    expect(result).toHaveLength(1);
    expect(result[0].firstName).toBe('Carl');
  });
});

describe('admin.settings.createAdmin', () => {
  it('runs the transaction and returns ok', async () => {
    mockTx.returning.mockResolvedValueOnce([{ id: 42 }]);

    const result = await createCaller(mockCtx()).admin.settings.createAdmin({
      firstName: 'New',
      lastName: 'Admin',
      email: 'new@admin.com',
    });

    expect(mockDb.transaction).toHaveBeenCalled();
    expect(mockTx.insert).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ ok: true });
  });
});
