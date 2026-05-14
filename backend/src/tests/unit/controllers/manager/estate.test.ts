import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
}));

vi.mock('@/db', () => ({ db: mockDb }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import { getEstate, postRenameEstate } from '@/controllers/manager/estate';

const sessionUser = { id: 1, role: 'manager' as const, estateId: 5 };
const fakeEstate  = { id: 5, name: 'Test Estate' };
const fakeArea    = { id: 1, name: 'North Block', estateId: 5 };
const fakeManager = { id: 2, firstName: 'Jane', lastName: 'Smith', role: 'manager', estateId: 5 };
const fakeStaff   = { id: 3, firstName: 'Bob',  lastName: 'Adams', role: 'staff',   estateId: 5 };

function mockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return { session: { user: sessionUser } as any, body: {}, params: {}, ip: '127.0.0.1', ...overrides };
}

function mockRes(): Partial<Response> {
  return { status: vi.fn().mockReturnThis(), send: vi.fn(), render: vi.fn(), redirect: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.where.mockReturnThis();
  mockDb.update.mockReturnThis();
  mockDb.set.mockReturnThis();
});

// ---------------------------------------------------------------------------
// getEstate
// ---------------------------------------------------------------------------

describe('getEstate', () => {
  it('renders the estate page with sorted people', async () => {
    // Q1: select estate → where() chains to limit()
    // Q2: select areas → where() is terminal
    // Q3: select people → where() is terminal
    mockDb.where
      .mockReturnValueOnce(mockDb)           // Q1 intermediate (chains to limit)
      .mockResolvedValueOnce([fakeArea])     // Q2 terminal
      .mockResolvedValueOnce([fakeStaff, fakeManager]); // Q3 terminal (unsorted)
    mockDb.limit.mockResolvedValueOnce([fakeEstate]);

    const res = mockRes();
    await getEstate(mockReq() as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith(
      'manager/estate/show',
      expect.objectContaining({
        estate: fakeEstate,
        areas: [fakeArea],
        // manager (role order 0) should sort before staff (role order 1)
        people: [fakeManager, fakeStaff],
      }),
    );
  });

  it('returns 404 when the estate is not found', async () => {
    mockDb.where.mockReturnValueOnce(mockDb);
    mockDb.limit.mockResolvedValueOnce([]);

    const res = mockRes();
    await getEstate(mockReq() as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 when the DB throws', async () => {
    mockDb.limit.mockRejectedValueOnce(new Error('DB error'));

    const res = mockRes();
    await getEstate(mockReq() as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---------------------------------------------------------------------------
// postRenameEstate
// ---------------------------------------------------------------------------

describe('postRenameEstate', () => {
  it('updates the name and redirects', async () => {
    const res = mockRes();
    await postRenameEstate(mockReq({ body: { name: 'New Name' } }) as Request, res as Response);

    expect(mockDb.update).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/estate');
  });

  it('returns 400 for an empty name', async () => {
    const res = mockRes();
    await postRenameEstate(mockReq({ body: { name: '' } }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('returns 500 when the DB throws', async () => {
    mockDb.where.mockRejectedValueOnce(new Error('DB error'));

    const res = mockRes();
    await postRenameEstate(mockReq({ body: { name: 'Valid Name' } }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
