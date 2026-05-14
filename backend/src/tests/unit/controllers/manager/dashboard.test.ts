import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
  },
}));

vi.mock('@/db', () => ({ db: mockDb }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import { getDashboard } from '@/controllers/manager/dashboard';

const sessionUser = { id: 1, role: 'manager' as const, estateId: 5 };
const fakeEstate = { id: 5, name: 'Test Estate' };
const fakeArea = { id: 1, name: 'North Block', estateId: 5 };

function mockReq(): Partial<Request> {
  return { session: { user: sessionUser } as any, ip: '127.0.0.1' };
}

function mockRes(): Partial<Response> {
  return { status: vi.fn().mockReturnThis(), send: vi.fn(), render: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
});

describe('getDashboard', () => {
  it('renders the dashboard with future events only', async () => {
    const futureEvent = { id: 10, date: '2099-01-01', estateId: 5, eventName: 'Future Hunt' };
    const pastEvent   = { id: 11, date: '2000-01-01', estateId: 5, eventName: 'Past Hunt' };

    mockDb.where
      .mockResolvedValueOnce([fakeEstate])
      .mockResolvedValueOnce([fakeArea])
      .mockResolvedValueOnce([futureEvent, pastEvent]);

    const res = mockRes();
    await getDashboard(mockReq() as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith(
      'manager/dashboard',
      expect.objectContaining({
        futureEvents: [futureEvent],
        areas: [fakeArea],
      }),
    );
  });

  it('returns 500 when the DB throws', async () => {
    mockDb.where.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();

    await getDashboard(mockReq() as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
