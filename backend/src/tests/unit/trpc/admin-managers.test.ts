import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/trpc/trpc';
import type { Context } from '@/trpc/context';

const { mockDb, mockTx } = vi.hoisted(() => {
  const mockTx = {
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    where: vi.fn(),
  };
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
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

const createCaller = createCallerFactory(appRouter);

const adminUser = { id: 1, role: 'admin' as const, estateId: null, firstName: 'A', lastName: 'B', email: 'a@b.com', active: true };
const fakeManager = { id: 10, firstName: 'Jane', lastName: 'Smith', role: 'manager', estateId: 5, email: 'jane@test.com', active: true };

function mockCtx(overrides: Partial<Context> = {}): Context {
  return { user: adminUser, ip: '127.0.0.1', req: {} as any, res: {} as any, session: {} as any, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.innerJoin.mockReturnThis();
  mockDb.leftJoin.mockReturnThis();
  mockDb.where.mockReturnThis();
  mockDb.update.mockReturnThis();
  mockDb.set.mockReturnThis();
  mockDb.delete.mockReturnThis();
  mockDb.transaction.mockImplementation(async (cb: any) => cb(mockTx));
  mockTx.delete.mockReturnThis();
  mockTx.insert.mockReturnThis();
  mockTx.values.mockReturnThis();
});

describe('admin.managers.get', () => {
  it('returns the manager when found', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeManager]);

    const result = await createCaller(mockCtx()).admin.managers.get({ id: 10 });

    expect(result).toEqual(fakeManager);
  });

  it('throws NOT_FOUND when the manager does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    await expect(createCaller(mockCtx()).admin.managers.get({ id: 99 }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('admin.managers.deactivate', () => {
  it('deactivates the manager and returns ok', async () => {
    const result = await createCaller(mockCtx()).admin.managers.deactivate({ id: 10 });

    expect(mockDb.update).toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });
});

describe('admin.managers.sendActivationLink', () => {
  it('sends the activation email and returns ok', async () => {
    mockDb.limit.mockResolvedValueOnce([{ firstName: 'Jane', email: 'jane@test.com' }]);

    const result = await createCaller(mockCtx()).admin.managers.sendActivationLink({ id: 10 });

    expect(mockDb.transaction).toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it('throws NOT_FOUND when the manager does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    await expect(createCaller(mockCtx()).admin.managers.sendActivationLink({ id: 99 }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('still returns ok when the activation email fails to send', async () => {
    const { sendMail } = await import('@/services/mail');
    vi.mocked(sendMail).mockRejectedValueOnce(new Error('SMTP error'));
    mockDb.limit.mockResolvedValueOnce([{ firstName: 'Jane', email: 'jane@test.com' }]);

    const result = await createCaller(mockCtx()).admin.managers.sendActivationLink({ id: 10 });

    expect(result).toEqual({ ok: true });
  });
});

describe('admin.managers.delete', () => {
  it('deletes the manager and returns ok', async () => {
    mockDb.limit.mockResolvedValueOnce([{ email: 'jane@test.com' }]);

    const result = await createCaller(mockCtx()).admin.managers.delete({ id: 10 });

    expect(mockDb.delete).toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it('throws NOT_FOUND when the manager does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    await expect(createCaller(mockCtx()).admin.managers.delete({ id: 99 }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
