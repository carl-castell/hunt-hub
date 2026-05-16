import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
  };
  return { mockDb };
});

vi.mock('@/db', () => ({ db: mockDb }));

import { requireWfsAuth } from '@/middlewares/requireWfsAuth';

function mockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return { query: {}, headers: {}, ...overrides };
}

function mockRes(): Partial<Response> {
  return {
    setHeader: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.innerJoin.mockReturnThis();
  mockDb.where.mockReturnThis();
});

describe('requireWfsAuth — no token', () => {
  it('returns 401 with WWW-Authenticate when no token in query or header', async () => {
    const req = mockReq({ query: {}, headers: {} });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireWfsAuth(req as Request, res as Response, next);

    expect(res.setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer realm="WFS"');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});

describe('requireWfsAuth — token sources', () => {
  const validRow = { userId: 5, active: true, role: 'manager', estateId: 10 };

  it('reads token from query param', async () => {
    mockDb.limit.mockResolvedValueOnce([validRow]);
    const req = mockReq({ query: { token: 'abc' } }) as any;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireWfsAuth(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(req.wfsUser).toEqual({ id: 5, estateId: 10 });
  });

  it('reads token from Authorization Bearer header', async () => {
    mockDb.limit.mockResolvedValueOnce([validRow]);
    const req = mockReq({ query: {}, headers: { authorization: 'Bearer mytoken' } }) as any;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireWfsAuth(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(req.wfsUser).toEqual({ id: 5, estateId: 10 });
  });
});

describe('requireWfsAuth — invalid token', () => {
  it('returns 401 when token matches no account', async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const req = mockReq({ query: { token: 'bad' } });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireWfsAuth(req as Request, res as Response, next);

    expect(res.setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer realm="WFS"');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when account is inactive', async () => {
    mockDb.limit.mockResolvedValueOnce([{ userId: 1, active: false, role: 'manager', estateId: 10 }]);
    const req = mockReq({ query: { token: 'tok' } });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireWfsAuth(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when role is not manager', async () => {
    mockDb.limit.mockResolvedValueOnce([{ userId: 1, active: true, role: 'staff', estateId: 10 }]);
    const req = mockReq({ query: { token: 'tok' } });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireWfsAuth(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when estateId is null', async () => {
    mockDb.limit.mockResolvedValueOnce([{ userId: 1, active: true, role: 'manager', estateId: null }]);
    const req = mockReq({ query: { token: 'tok' } });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireWfsAuth(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireWfsAuth — valid token', () => {
  it('sets req.wfsUser and calls next()', async () => {
    mockDb.limit.mockResolvedValueOnce([{ userId: 7, active: true, role: 'manager', estateId: 42 }]);
    const req = mockReq({ query: { token: 'goodtok' } }) as any;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireWfsAuth(req as Request, res as Response, next);

    expect(req.wfsUser).toEqual({ id: 7, estateId: 42 });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
