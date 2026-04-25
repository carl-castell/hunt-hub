import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

vi.mock('@/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
  },
}));

import { db } from '@/db';
import {
  requireAuth,
  requireAdmin,
  requireManager,
  requireStaff,
  requireEstateAccess,
  requireUserAccess,
} from '@/middlewares/requireRole';

const mockLimit = vi.mocked(db as any).limit as ReturnType<typeof vi.fn>;

function mockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return { session: {} as any, params: {}, ...overrides };
}

function mockRes(): Partial<Response> {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
  };
}

function mockNext(): NextFunction {
  return vi.fn();
}

describe('requireAuth', () => {
  it('calls next() if session user exists', () => {
    const req = mockReq({ session: { user: { id: 1, role: 'admin' } } as any });
    const res = mockRes();
    const next = mockNext();

    requireAuth(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('redirects to /login if no session user', () => {
    const req = mockReq({ session: {} as any });
    const res = mockRes();
    const next = mockNext();

    requireAuth(req as Request, res as Response, next);

    expect(res.redirect).toHaveBeenCalledWith('/login');
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireAdmin', () => {
  it('calls next() if user is admin', () => {
    const req = mockReq({ session: { user: { id: 1, role: 'admin' } } as any });
    const res = mockRes();
    const next = mockNext();

    requireAdmin(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 403 if user is not admin', () => {
    const req = mockReq({ session: { user: { id: 2, role: 'manager' } } as any });
    const res = mockRes();
    const next = mockNext();

    requireAdmin(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Forbidden');
    expect(next).not.toHaveBeenCalled();
  });

  it('redirects to /login if no session', () => {
    const req = mockReq({ session: {} as any });
    const res = mockRes();
    const next = mockNext();

    requireAdmin(req as Request, res as Response, next);

    expect(res.redirect).toHaveBeenCalledWith('/login');
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireManager', () => {
  beforeEach(() => {
    vi.mocked(db as any).select.mockClear();
    vi.mocked(db as any).from.mockClear();
    vi.mocked(db as any).where.mockClear();
    mockLimit.mockReset();
  });

  it('calls next() if user is manager', async () => {
    mockLimit.mockResolvedValueOnce([{ id: 1, role: 'manager' }]);

    const req = mockReq({ session: { user: { id: 1, role: 'manager' } } as any });
    const res = mockRes();
    const next = mockNext();

    await requireManager(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 if user is not manager', async () => {
    mockLimit.mockResolvedValueOnce([{ id: 2, role: 'admin' }]);

    const req = mockReq({ session: { user: { id: 2, role: 'admin' } } as any });
    const res = mockRes();
    const next = mockNext();

    await requireManager(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Forbidden');
    expect(next).not.toHaveBeenCalled();
  });

  it('redirects to /login if no session', async () => {
    const req = mockReq({ session: {} as any });
    const res = mockRes();
    const next = mockNext();

    await requireManager(req as Request, res as Response, next);

    expect(res.redirect).toHaveBeenCalledWith('/login');
    expect(next).not.toHaveBeenCalled();
    expect(vi.mocked(db as any).select).not.toHaveBeenCalled();
  });

  it('returns 500 if db throws', async () => {
    mockLimit.mockRejectedValueOnce(new Error('DB failure'));

    const req = mockReq({ session: { user: { id: 1, role: 'manager' } } as any });
    const res = mockRes();
    const next = mockNext();

    await requireManager(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith('Server error');
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireStaff', () => {
  it('calls next() if user is staff', () => {
    const req = mockReq({ session: { user: { id: 1, role: 'staff' } } as any });
    const res = mockRes();
    const next = mockNext();

    requireStaff(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 403 if user is not staff', () => {
    const req = mockReq({ session: { user: { id: 2, role: 'admin' } } as any });
    const res = mockRes();
    const next = mockNext();

    requireStaff(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Forbidden');
    expect(next).not.toHaveBeenCalled();
  });

  it('redirects to /login if no session', () => {
    const req = mockReq({ session: {} as any });
    const res = mockRes();
    const next = mockNext();

    requireStaff(req as Request, res as Response, next);

    expect(res.redirect).toHaveBeenCalledWith('/login');
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireEstateAccess', () => {
  it('calls next() if user is admin', () => {
    const req = mockReq({
      session: { user: { id: 1, role: 'admin', estateId: null } } as any,
      params: { id: '5' },
    });
    const res = mockRes();
    const next = mockNext();

    requireEstateAccess(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('calls next() if manager estateId matches param id', () => {
    const req = mockReq({
      session: { user: { id: 2, role: 'manager', estateId: 5 } } as any,
      params: { id: '5' },
    });
    const res = mockRes();
    const next = mockNext();

    requireEstateAccess(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 403 if manager estateId does not match param id', () => {
    const req = mockReq({
      session: { user: { id: 2, role: 'manager', estateId: 5 } } as any,
      params: { id: '99' },
    });
    const res = mockRes();
    const next = mockNext();

    requireEstateAccess(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Forbidden');
    expect(next).not.toHaveBeenCalled();
  });

  it('redirects to /login if no session', () => {
    const req = mockReq({ session: {} as any, params: { id: '5' } });
    const res = mockRes();
    const next = mockNext();

    requireEstateAccess(req as Request, res as Response, next);

    expect(res.redirect).toHaveBeenCalledWith('/login');
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireUserAccess', () => {
  beforeEach(() => {
    vi.mocked(db as any).select.mockClear();
    vi.mocked(db as any).from.mockClear();
    vi.mocked(db as any).where.mockClear();
    mockLimit.mockReset();
  });

  it('redirects to /login if no session', async () => {
    const req = mockReq({ session: {} as any, params: { id: '10' } });
    const res = mockRes();
    const next = mockNext();

    await requireUserAccess(req as Request, res as Response, next);

    expect(res.redirect).toHaveBeenCalledWith('/login');
    expect(next).not.toHaveBeenCalled();
    expect(vi.mocked(db as any).select).not.toHaveBeenCalled();
  });

  it('calls next() immediately for admin without a DB lookup', async () => {
    const req = mockReq({ session: { user: { id: 1, role: 'admin', estateId: null } } as any, params: { id: '10' } });
    const res = mockRes();
    const next = mockNext();

    await requireUserAccess(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(vi.mocked(db as any).select).not.toHaveBeenCalled();
  });

  it('calls next() if manager estateId matches target user estateId', async () => {
    mockLimit.mockResolvedValueOnce([{ id: 10, estateId: 5 }]);

    const req = mockReq({ session: { user: { id: 2, role: 'manager', estateId: 5 } } as any, params: { id: '10' } });
    const res = mockRes();
    const next = mockNext();

    await requireUserAccess(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 403 if manager estateId does not match target user estateId', async () => {
    mockLimit.mockResolvedValueOnce([{ id: 10, estateId: 99 }]);

    const req = mockReq({ session: { user: { id: 2, role: 'manager', estateId: 5 } } as any, params: { id: '10' } });
    const res = mockRes();
    const next = mockNext();

    await requireUserAccess(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Forbidden');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 if target user does not exist', async () => {
    mockLimit.mockResolvedValueOnce([]);

    const req = mockReq({ session: { user: { id: 2, role: 'manager', estateId: 5 } } as any, params: { id: '999' } });
    const res = mockRes();
    const next = mockNext();

    await requireUserAccess(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith('User not found');
    expect(next).not.toHaveBeenCalled();
  });
});
