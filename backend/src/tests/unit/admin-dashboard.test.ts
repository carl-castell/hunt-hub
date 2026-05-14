import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn(),
  },
}));

vi.mock('@/db', () => ({ db: mockDb }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import { getDashboard } from '@/controllers/admin/dashboard';

function mockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    session: { user: { id: 1, role: 'admin', estateId: null } } as any,
    ip: '127.0.0.1',
    ...overrides,
  };
}

function mockRes(): Partial<Response> {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn(),
    render: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnThis();
});

describe('getDashboard', () => {
  it('renders the dashboard with all estates', async () => {
    const estates = [{ id: 1, name: 'Estate A' }, { id: 2, name: 'Estate B' }];
    mockDb.from.mockResolvedValueOnce(estates);
    const req = mockReq();
    const res = mockRes();

    await getDashboard(req as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith(
      'admin/admin-dashboard',
      expect.objectContaining({ estates }),
    );
  });

  it('returns 500 when the DB throws', async () => {
    mockDb.from.mockRejectedValueOnce(new Error('DB error'));
    const req = mockReq();
    const res = mockRes();

    await getDashboard(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
