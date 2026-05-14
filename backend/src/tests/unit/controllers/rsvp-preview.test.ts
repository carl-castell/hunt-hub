import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
  };
  return { mockDb };
});

vi.mock('@/db', () => ({ db: mockDb }));

import {
  getPreviewRsvp,
  postPreviewRespond,
  postPreviewUploadLicense,
  postPreviewUploadCertificate,
  postPreviewUploadDetails,
} from '@/controllers/rsvp-preview';

function mockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    session: { user: { id: 1, role: 'manager', estateId: 10 } } as any,
    params: {},
    query: {},
    body: {},
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

const fakeEvent = { id: 5, eventName: 'Autumn Hunt', date: '2030-11-15', time: '09:00', estateId: 10 };

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.where.mockReturnThis();
});

describe('getPreviewRsvp', () => {
  it('renders rsvp/respond for the default open state', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeEvent]);
    const req = mockReq({ params: { eventId: '5' }, query: {} });
    const res = mockRes();

    await getPreviewRsvp(req as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith('rsvp/respond', expect.any(Object));
  });

  it('renders rsvp/confirmed for state=yes without a step', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeEvent]);
    const req = mockReq({ params: { eventId: '5' }, query: { state: 'yes' } });
    const res = mockRes();

    await getPreviewRsvp(req as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith('rsvp/confirmed', expect.any(Object));
  });

  it('renders rsvp/upload for state=yes with step=1', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeEvent]);
    const req = mockReq({ params: { eventId: '5' }, query: { state: 'yes', step: '1' } });
    const res = mockRes();

    await getPreviewRsvp(req as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith('rsvp/upload', expect.any(Object));
  });

  it('renders rsvp/declined for state=no', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeEvent]);
    const req = mockReq({ params: { eventId: '5' }, query: { state: 'no' } });
    const res = mockRes();

    await getPreviewRsvp(req as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith('rsvp/declined', expect.any(Object));
  });

  it('returns 404 when the event does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const req = mockReq({ params: { eventId: '99' }, query: {} });
    const res = mockRes();

    await getPreviewRsvp(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.render).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid eventId', async () => {
    const req = mockReq({ params: { eventId: 'bad' }, query: {} });
    const res = mockRes();

    await getPreviewRsvp(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('postPreviewRespond', () => {
  it('redirects to state=yes&step=1 when the answer is yes', () => {
    const req = mockReq({ params: { eventId: '5' }, body: { answer: 'yes' } });
    const res = mockRes();

    postPreviewRespond(req as Request, res as Response);

    expect(res.redirect).toHaveBeenCalledWith('/rsvp/preview/5?state=yes&step=1');
  });

  it('redirects to state=no when the answer is no', () => {
    const req = mockReq({ params: { eventId: '5' }, body: { answer: 'no' } });
    const res = mockRes();

    postPreviewRespond(req as Request, res as Response);

    expect(res.redirect).toHaveBeenCalledWith('/rsvp/preview/5?state=no');
  });

  it('treats any non-yes answer as no', () => {
    const req = mockReq({ params: { eventId: '5' }, body: { answer: 'maybe' } });
    const res = mockRes();

    postPreviewRespond(req as Request, res as Response);

    expect(res.redirect).toHaveBeenCalledWith('/rsvp/preview/5?state=no');
  });
});

describe('postPreviewUploadLicense', () => {
  it('redirects to step=2', () => {
    const req = mockReq({ params: { eventId: '5' } });
    const res = mockRes();

    postPreviewUploadLicense(req as Request, res as Response);

    expect(res.redirect).toHaveBeenCalledWith('/rsvp/preview/5?state=yes&step=2');
  });
});

describe('postPreviewUploadCertificate', () => {
  it('redirects to step=3', () => {
    const req = mockReq({ params: { eventId: '5' } });
    const res = mockRes();

    postPreviewUploadCertificate(req as Request, res as Response);

    expect(res.redirect).toHaveBeenCalledWith('/rsvp/preview/5?state=yes&step=3');
  });
});

describe('postPreviewUploadDetails', () => {
  it('redirects back to the confirmed view', () => {
    const req = mockReq({ params: { eventId: '5' } });
    const res = mockRes();

    postPreviewUploadDetails(req as Request, res as Response);

    expect(res.redirect).toHaveBeenCalledWith('/rsvp/preview/5?state=yes');
  });
});
