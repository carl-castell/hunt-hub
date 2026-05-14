import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/trpc/trpc';
import type { Context } from '@/trpc/context';

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn(),
  };
  return { mockDb };
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
  mockDb.leftJoin.mockReturnThis();
  mockDb.orderBy.mockReturnThis();
  mockDb.limit.mockReturnThis();
});

describe('admin.audit.list', () => {
  it('returns rows, total, and pageSize', async () => {
    mockDb.from.mockResolvedValueOnce([{ count: 5 }]);
    mockDb.offset.mockResolvedValueOnce([{ id: 1, event: 'login', ip: '127.0.0.1' }]);

    const result = await createCaller(mockCtx()).admin.audit.list({ page: 0 });

    expect(result.total).toBe(5);
    expect(result.rows).toHaveLength(1);
    expect(result.pageSize).toBe(50);
  });

  it('returns empty rows when there are no logs', async () => {
    mockDb.from.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.offset.mockResolvedValueOnce([]);

    const result = await createCaller(mockCtx()).admin.audit.list({ page: 0 });

    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('throws UNAUTHORIZED when there is no user', async () => {
    await expect(createCaller(mockCtx({ user: null })).admin.audit.list({ page: 0 }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
