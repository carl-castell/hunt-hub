import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

const { mockDb, mockTx } = vi.hoisted(() => {
  const mockTx = {
    delete: vi.fn().mockReturnThis(),
    where: vi.fn(),
  };
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
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

import { createEstate, getEstate, renameEstate, deleteEstate } from '@/controllers/admin/estates';

function mockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    session: { user: { id: 1, role: 'admin', estateId: null } } as any,
    params: {},
    body: {},
    ip: '127.0.0.1',
    ...overrides,
  };
}

function mockRes(): Partial<Response> {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn(),
    render: vi.fn(),
    redirect: vi.fn(),
    locals: {} as any,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Restore chain mocks cleared by clearAllMocks
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.innerJoin.mockReturnThis();
  mockDb.where.mockReturnThis();
  mockDb.insert.mockReturnThis();
  mockDb.values.mockReturnThis();
  mockDb.update.mockReturnThis();
  mockDb.set.mockReturnThis();
  mockDb.delete.mockReturnThis();
  mockDb.transaction.mockImplementation(async (cb: any) => cb(mockTx));
  mockTx.delete.mockReturnThis();
});

describe('createEstate', () => {
  it('inserts the estate and redirects to its page', async () => {
    mockDb.returning.mockResolvedValueOnce([{ id: 5, name: 'New Estate' }]);
    const req = mockReq({ body: { name: 'New Estate' } });
    const res = mockRes();

    await createEstate(req as Request, res as Response);

    expect(mockDb.insert).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/admin/estates/5');
  });

  it('returns 400 for an empty name without touching the DB', async () => {
    const req = mockReq({ body: { name: '' } });
    const res = mockRes();

    await createEstate(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('returns 500 when the DB throws', async () => {
    mockDb.returning.mockRejectedValueOnce(new Error('DB error'));
    const req = mockReq({ body: { name: 'Valid Estate' } });
    const res = mockRes();

    await createEstate(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('getEstate', () => {
  it('renders the estate page when the estate is found', async () => {
    const estate = { id: 3, name: 'Test Estate' };
    mockDb.limit.mockResolvedValueOnce([estate]);
    // managers query ends at .where() — returns mockDb which is fine since res.render is mocked
    const req = mockReq({ params: { id: '3' } });
    const res = mockRes();

    await getEstate(req as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith('admin/estate', expect.objectContaining({ estate }));
  });

  it('returns 404 when the estate does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const req = mockReq({ params: { id: '99' } });
    const res = mockRes();

    await getEstate(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('renameEstate', () => {
  it('updates the name and redirects', async () => {
    const req = mockReq({ params: { id: '3' }, body: { name: 'Renamed Estate' } });
    const res = mockRes();

    await renameEstate(req as Request, res as Response);

    expect(mockDb.update).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/admin/estates/3');
  });

  it('returns 400 for an empty name', async () => {
    const req = mockReq({ params: { id: '3' }, body: { name: '' } });
    const res = mockRes();

    await renameEstate(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

describe('deleteEstate', () => {
  it('runs a transaction deleting users then estate, then redirects to /admin', async () => {
    const req = mockReq({ params: { id: '3' } });
    const res = mockRes();

    await deleteEstate(req as Request, res as Response);

    expect(mockDb.transaction).toHaveBeenCalled();
    expect(mockTx.delete).toHaveBeenCalledTimes(2);
    expect(res.redirect).toHaveBeenCalledWith('/admin');
  });
});
