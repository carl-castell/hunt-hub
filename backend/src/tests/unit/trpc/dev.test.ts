import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCallerFactory } from '@/trpc/trpc';
import type { Context } from '@/trpc/context';

const { mockDb, mockAudit } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  },
  mockAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/db', () => ({ db: mockDb }));
vi.mock('@/services/audit', () => ({ audit: mockAudit }));

import { appRouter } from '@/trpc/router';
import { logger } from '@/utils/logger';

const mockWarn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

const createCaller = createCallerFactory(appRouter);

function mockCtx(): Context {
  const session = {
    user: undefined as any,
    regenerate: vi.fn().mockImplementation((cb: any) => cb(null)),
    save: vi.fn().mockImplementation((cb: any) => cb(null)),
  };
  return { user: null, ip: '127.0.0.1', req: { session } as any, res: {} as any, session: session as any };
}

const managerRow = {
  accounts: { email: 'max@test.com', active: true, userId: 7 },
  users: { id: 7, firstName: 'Max', lastName: 'Manager', role: 'manager' as const, estateId: 3 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockWarn.mockImplementation(() => undefined);
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.innerJoin.mockReturnThis();
  mockDb.where.mockReturnThis();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('dev router without DEV_LOGIN', () => {
  it('answers NOT_FOUND, as if it did not exist', async () => {
    vi.stubEnv('DEV_LOGIN', '');
    const caller = createCaller(mockCtx());
    await expect(caller.dev.users()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(caller.dev.loginAs({ userId: 7 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('stays off on the production database (Neon), even on a local server', async () => {
    vi.stubEnv('DEV_LOGIN', 'true');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DB_PROVIDER', 'neon');
    await expect(createCaller(mockCtx()).dev.users()).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('stays off in production even with DEV_LOGIN=true', async () => {
    vi.stubEnv('DEV_LOGIN', 'true');
    vi.stubEnv('NODE_ENV', 'production');
    await expect(createCaller(mockCtx()).dev.loginAs({ userId: 7 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('dev router with DEV_LOGIN=true', () => {
  beforeEach(() => {
    vi.stubEnv('DEV_LOGIN', 'true');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DB_PROVIDER', 'local');
  });

  it('lists the active admins and managers', async () => {
    const rows = [{ id: 7, firstName: 'Max', lastName: 'Manager', email: 'max@test.com', role: 'manager' }];
    mockDb.orderBy.mockResolvedValueOnce(rows);
    await expect(createCaller(mockCtx()).dev.users()).resolves.toEqual(rows);
  });

  it('logs in as the user: new session, audit entry marked as dev login, warning in the log', async () => {
    mockDb.limit.mockResolvedValueOnce([{ active: true }]).mockResolvedValueOnce([managerRow]);
    const ctx = mockCtx();

    const user = await createCaller(ctx).dev.loginAs({ userId: 7 });

    expect(user).toMatchObject({ id: 7, role: 'manager', email: 'max@test.com', estateId: 3 });
    expect(ctx.req.session.regenerate).toHaveBeenCalled();
    expect(ctx.req.session.user).toMatchObject({ id: 7 });
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, event: 'login', metadata: { devLogin: true } }));
    expect(mockWarn).toHaveBeenCalledWith({ userId: 7 }, expect.stringContaining('dev login'));
  });

  it('refuses inactive or unknown users', async () => {
    mockDb.limit.mockResolvedValueOnce([{ active: false }]);
    await expect(createCaller(mockCtx()).dev.loginAs({ userId: 7 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    mockDb.limit.mockResolvedValueOnce([]);
    await expect(createCaller(mockCtx()).dev.loginAs({ userId: 99 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
