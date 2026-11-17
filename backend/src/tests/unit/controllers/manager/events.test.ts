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
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  },
}));

vi.mock('@/db', () => ({ db: mockDb }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));
const { mockCreateEvent } = vi.hoisted(() => ({ mockCreateEvent: vi.fn() }));
vi.mock('@/services/events', () => ({ createEvent: mockCreateEvent }));

import { getEvents, getEvent, postCreateEvent, postUpdateEvent, postDeleteEvent } from '@/controllers/manager/events';

const sessionUser = { id: 1, role: 'manager' as const, estateId: 5 };
const fakeEvent   = { id: 10, eventName: 'Autumn Hunt', date: '2099-11-01', time: '09:00', estateId: 5 };
const fakeDrive   = { id: 3, name: 'Beat 1', eventId: 10 };
const validEventBody = { eventName: 'Autumn Hunt', date: '2099-11-01', time: '09:00' };

function mockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return { session: { user: sessionUser } as any, params: {}, body: {}, ip: '127.0.0.1', ...overrides };
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
  mockDb.update.mockReturnThis();
  mockDb.set.mockReturnThis();
  mockDb.delete.mockReturnThis();
});

// ---------------------------------------------------------------------------
// getEvents
// ---------------------------------------------------------------------------

describe('getEvents', () => {
  it('renders with upcoming and past events split and sorted', async () => {
    const future = { ...fakeEvent, id: 1, date: '2099-11-01' };
    const past   = { ...fakeEvent, id: 2, date: '2000-01-01' };
    mockDb.where.mockResolvedValueOnce([future, past]);
    const res = mockRes();

    await getEvents(mockReq() as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith(
      'manager/events/list',
      expect.objectContaining({ upcomingEvents: [future], pastEvents: [past] }),
    );
  });

  it('returns 500 when the DB throws', async () => {
    mockDb.where.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();

    await getEvents(mockReq() as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---------------------------------------------------------------------------
// getEvent
// ---------------------------------------------------------------------------

describe('getEvent', () => {
  it('renders the event page with its drives', async () => {
    // Q1: select event → where() chains to limit()
    // Q2: select drives → where() is terminal
    mockDb.where
      .mockReturnValueOnce(mockDb)
      .mockResolvedValueOnce([fakeDrive]);
    mockDb.limit.mockResolvedValueOnce([fakeEvent]);
    const res = mockRes();

    await getEvent(mockReq({ params: { id: '10' } }) as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith(
      'manager/events/show',
      expect.objectContaining({ event: fakeEvent, drives: [fakeDrive] }),
    );
  });

  it('returns 404 when the event is not found', async () => {
    mockDb.where.mockReturnValueOnce(mockDb);
    mockDb.limit.mockResolvedValueOnce([]);
    const res = mockRes();

    await getEvent(mockReq({ params: { id: '99' } }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 when the event belongs to a different estate', async () => {
    mockDb.where.mockReturnValueOnce(mockDb);
    mockDb.limit.mockResolvedValueOnce([{ ...fakeEvent, estateId: 99 }]);
    const res = mockRes();

    await getEvent(mockReq({ params: { id: '10' } }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 when the DB throws', async () => {
    mockDb.limit.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();

    await getEvent(mockReq({ params: { id: '10' } }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---------------------------------------------------------------------------
// postCreateEvent
// ---------------------------------------------------------------------------

describe('postCreateEvent', () => {
  it('creates the event (with Drive 1 at the given time) and redirects to it', async () => {
    mockCreateEvent.mockResolvedValueOnce({ id: 10 });
    const res = mockRes();

    await postCreateEvent(mockReq({ body: validEventBody }) as Request, res as Response);

    expect(mockCreateEvent).toHaveBeenCalledWith(5, { name: 'Autumn Hunt', date: '2099-11-01', start: '09:00' }, { userId: 1, ip: '127.0.0.1' });
    expect(res.redirect).toHaveBeenCalledWith('/manager/events/10');
  });

  it('returns 400 for an invalid body', async () => {
    const res = mockRes();

    await postCreateEvent(mockReq({ body: {} }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockCreateEvent).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// postUpdateEvent
// ---------------------------------------------------------------------------

describe('postUpdateEvent', () => {
  it('updates the event and redirects', async () => {
    mockDb.where.mockReturnValueOnce(mockDb);  // select-where → chains to limit
    mockDb.limit.mockResolvedValueOnce([fakeEvent]);
    const res = mockRes();

    await postUpdateEvent(mockReq({ params: { id: '10' }, body: validEventBody }) as Request, res as Response);

    expect(mockDb.update).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/events/10');
  });

  it('returns 404 when the event does not exist', async () => {
    mockDb.where.mockReturnValueOnce(mockDb);
    mockDb.limit.mockResolvedValueOnce([]);
    const res = mockRes();

    await postUpdateEvent(mockReq({ params: { id: '99' }, body: validEventBody }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 for an invalid body', async () => {
    mockDb.where.mockReturnValueOnce(mockDb);
    mockDb.limit.mockResolvedValueOnce([fakeEvent]);
    const res = mockRes();

    await postUpdateEvent(mockReq({ params: { id: '10' }, body: {} }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ---------------------------------------------------------------------------
// postDeleteEvent
// ---------------------------------------------------------------------------

describe('postDeleteEvent', () => {
  it('deletes the event and redirects to the events list', async () => {
    mockDb.where.mockReturnValueOnce(mockDb);  // select-where → chains to limit
    mockDb.limit.mockResolvedValueOnce([fakeEvent]);
    const res = mockRes();

    await postDeleteEvent(mockReq({ params: { id: '10' } }) as Request, res as Response);

    expect(mockDb.delete).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/events');
  });

  it('returns 404 when the event does not exist', async () => {
    mockDb.where.mockReturnValueOnce(mockDb);
    mockDb.limit.mockResolvedValueOnce([]);
    const res = mockRes();

    await postDeleteEvent(mockReq({ params: { id: '99' } }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 when the DB throws', async () => {
    mockDb.limit.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();

    await postDeleteEvent(mockReq({ params: { id: '10' } }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
