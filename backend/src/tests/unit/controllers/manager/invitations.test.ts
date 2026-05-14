import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

const { mockDb, mockSendMail, mockRenderTemplate } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    orderBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };
  const mockSendMail = vi.fn().mockResolvedValue(undefined);
  const mockRenderTemplate = vi.fn().mockResolvedValue('<html>');
  return { mockDb, mockSendMail, mockRenderTemplate };
});

vi.mock('@/db', () => ({ db: mockDb }));
vi.mock('@/services/audit', () => ({ audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/services/mail', () => ({ sendMail: mockSendMail, renderTemplate: mockRenderTemplate }));
vi.mock('@/utils/url', () => ({ getBaseUrl: vi.fn().mockReturnValue('https://example.com') }));

import {
  postStageInvitations,
  postRemoveInvitation,
  postUpdateInvitation,
  postSendInvitations,
} from '@/controllers/manager/invitations';

function mockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    session: { user: { id: 1, role: 'manager', estateId: 10 } } as any,
    params: {},
    body: {},
    query: {},
    headers: {},
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

const fakeEvent = { id: 1, eventName: 'Test Event', date: '2030-11-01', time: '09:00', estateId: 10 };

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.innerJoin.mockReturnThis();
  mockDb.where.mockReturnThis();
  mockDb.orderBy.mockReturnThis();
  mockDb.insert.mockReturnThis();
  mockDb.values.mockReturnThis();
  mockDb.update.mockReturnThis();
  mockDb.set.mockReturnThis();
  mockDb.delete.mockReturnThis();
  mockSendMail.mockResolvedValue(undefined);
  mockRenderTemplate.mockResolvedValue('<html>');
});

describe('postStageInvitations', () => {
  it('inserts staged invitations and redirects', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeEvent]);
    mockDb.onConflictDoNothing.mockResolvedValueOnce(undefined);
    const req = mockReq({ params: { eventId: '1' }, body: { guestIds: ['10', '20'] } });
    const res = mockRes();

    await postStageInvitations(req as Request, res as Response);

    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.onConflictDoNothing).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/events/1/invitations');
  });

  it('redirects without inserting when guestIds is empty', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeEvent]);
    const req = mockReq({ params: { eventId: '1' }, body: { guestIds: [] } });
    const res = mockRes();

    await postStageInvitations(req as Request, res as Response);

    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/events/1/invitations');
  });

  it('returns 404 when the event does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const req = mockReq({ params: { eventId: '99' }, body: { guestIds: ['10'] } });
    const res = mockRes();

    await postStageInvitations(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid eventId', async () => {
    const req = mockReq({ params: { eventId: 'abc' }, body: { guestIds: ['10'] } });
    const res = mockRes();

    await postStageInvitations(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('postRemoveInvitation', () => {
  it('deletes the invitation and redirects', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeEvent]);
    const req = mockReq({ params: { eventId: '1', invitationId: '5' } });
    const res = mockRes();

    await postRemoveInvitation(req as Request, res as Response);

    expect(mockDb.delete).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/events/1/invitations');
  });

  it('returns 404 when the event does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const req = mockReq({ params: { eventId: '1', invitationId: '5' } });
    const res = mockRes();

    await postRemoveInvitation(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });
});

describe('postUpdateInvitation', () => {
  it('updates status and response then redirects', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeEvent]);
    mockDb.limit.mockResolvedValueOnce([{ respondedAt: null }]);
    const req = mockReq({
      params: { eventId: '1', invitationId: '5' },
      body: { status: 'sent_email', response: 'yes' },
    });
    const res = mockRes();

    await postUpdateInvitation(req as Request, res as Response);

    expect(mockDb.update).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/events/1/invitations/5');
  });

  it('returns 400 for an invalid status/response combination', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeEvent]);
    const req = mockReq({
      params: { eventId: '1', invitationId: '5' },
      body: { status: 'invalid_status', response: 'open' },
    });
    const res = mockRes();

    await postUpdateInvitation(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the invitation does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeEvent]);
    mockDb.limit.mockResolvedValueOnce([]);
    const req = mockReq({
      params: { eventId: '1', invitationId: '99' },
      body: { status: 'staged', response: 'open' },
    });
    const res = mockRes();

    await postUpdateInvitation(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 when the event does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const req = mockReq({
      params: { eventId: '99', invitationId: '5' },
      body: { status: 'staged', response: 'open' },
    });
    const res = mockRes();

    await postUpdateInvitation(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('postSendInvitations', () => {
  const invRow = {
    invId: 1,
    publicId: 'pub-abc',
    status: 'staged',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
  };

  it('sends emails, updates status, and redirects with counts', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeEvent]);
    mockDb.limit.mockResolvedValueOnce([invRow]);
    const req = mockReq({
      params: { eventId: '1' },
      body: { message: 'Hello {{firstName}}', invitationIds: ['1'] },
    });
    const res = mockRes();

    await postSendInvitations(req as Request, res as Response);

    expect(mockSendMail).toHaveBeenCalledOnce();
    expect(mockDb.update).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/events/1/invitations?sent=1&failed=0');
  });

  it('redirects with sent=0 when no matching staged invitation is found', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeEvent]);
    mockDb.limit.mockResolvedValueOnce([]);
    const req = mockReq({
      params: { eventId: '1' },
      body: { message: 'Hello', invitationIds: ['1'] },
    });
    const res = mockRes();

    await postSendInvitations(req as Request, res as Response);

    expect(mockSendMail).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/events/1/invitations?sent=0&failed=0');
  });

  it('returns 400 when invitationIds is empty', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeEvent]);
    const req = mockReq({
      params: { eventId: '1' },
      body: { message: 'Hello', invitationIds: [] },
    });
    const res = mockRes();

    await postSendInvitations(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('returns 400 when the schema is invalid (missing message)', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeEvent]);
    const req = mockReq({
      params: { eventId: '1' },
      body: { invitationIds: ['1'] },
    });
    const res = mockRes();

    await postSendInvitations(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when the event does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const req = mockReq({
      params: { eventId: '99' },
      body: { message: 'Hello', invitationIds: ['1'] },
    });
    const res = mockRes();

    await postSendInvitations(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('counts failed emails without throwing when sendMail rejects', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeEvent]);
    mockDb.limit.mockResolvedValueOnce([invRow]);
    mockSendMail.mockRejectedValueOnce(new Error('SMTP error'));
    const req = mockReq({
      params: { eventId: '1' },
      body: { message: 'Hello', invitationIds: ['1'] },
    });
    const res = mockRes();

    await postSendInvitations(req as Request, res as Response);

    expect(res.redirect).toHaveBeenCalledWith('/manager/events/1/invitations?sent=0&failed=1');
  });
});
