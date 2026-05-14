import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
  },
}));

vi.mock('@/db', () => ({ db: mockDb }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import { postCreateDrive, getDrive } from '@/controllers/manager/drives';

const sessionUser = { id: 1, role: 'manager' as const, estateId: 5 };
const fakeEvent = { id: 7, eventName: 'Autumn Hunt', estateId: 5, date: '2099-11-01', time: '09:00' };
const fakeDrive = { id: 3, name: 'Beat 1', eventId: 7, startTime: '09:00', endTime: '12:00' };
const validDriveBody = { name: 'Beat 1', startTime: '09:00', endTime: '12:00' };

function mockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    session: { user: sessionUser } as any,
    params: { eventId: '7' },
    body: {},
    ip: '127.0.0.1',
    ...overrides,
  };
}

function mockRes(): Partial<Response> {
  return { status: vi.fn().mockReturnThis(), send: vi.fn(), render: vi.fn(), redirect: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.where.mockReturnThis();
  mockDb.insert.mockReturnThis();
  mockDb.values.mockReturnThis();
});

// ---------------------------------------------------------------------------
// postCreateDrive
// ---------------------------------------------------------------------------

describe('postCreateDrive', () => {
  it('inserts the drive and redirects to its page', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeEvent]);
    mockDb.returning.mockResolvedValueOnce([fakeDrive]);
    const res = mockRes();

    await postCreateDrive(mockReq({ body: validDriveBody }) as Request, res as Response);

    expect(mockDb.insert).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/events/7/drives/3');
  });

  it('returns 404 when the event does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const res = mockRes();

    await postCreateDrive(mockReq({ body: validDriveBody }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 when the event belongs to a different estate', async () => {
    mockDb.limit.mockResolvedValueOnce([{ ...fakeEvent, estateId: 99 }]);
    const res = mockRes();

    await postCreateDrive(mockReq({ body: validDriveBody }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 for an invalid body', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeEvent]);
    const res = mockRes();

    await postCreateDrive(mockReq({ body: {} }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('returns 500 when the DB throws', async () => {
    mockDb.limit.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();

    await postCreateDrive(mockReq({ body: validDriveBody }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---------------------------------------------------------------------------
// getDrive
// ---------------------------------------------------------------------------

describe('getDrive', () => {
  it('renders the drive page when found', async () => {
    mockDb.limit
      .mockResolvedValueOnce([fakeEvent])  // resolveEvent
      .mockResolvedValueOnce([fakeDrive]); // drive query
    const res = mockRes();

    await getDrive(mockReq({ params: { eventId: '7', id: '3' } }) as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith('manager/events/drive', expect.objectContaining({ drive: fakeDrive }));
  });

  it('returns 404 when the drive does not exist', async () => {
    mockDb.limit
      .mockResolvedValueOnce([fakeEvent])
      .mockResolvedValueOnce([]);
    const res = mockRes();

    await getDrive(mockReq({ params: { eventId: '7', id: '99' } }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 when the event does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const res = mockRes();

    await getDrive(mockReq({ params: { eventId: '99', id: '3' } }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 when the DB throws', async () => {
    mockDb.limit.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();

    await getDrive(mockReq({ params: { eventId: '7', id: '3' } }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
