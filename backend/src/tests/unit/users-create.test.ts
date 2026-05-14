import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

const { mockDb, mockTx, mockSendMail, mockRenderTemplate } = vi.hoisted(() => {
  const mockTx = {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
  };
  const mockDb = {
    transaction: vi.fn().mockImplementation(async (cb: any) => cb(mockTx)),
  };
  const mockSendMail = vi.fn().mockResolvedValue(undefined);
  const mockRenderTemplate = vi.fn().mockResolvedValue('<html>');
  return { mockDb, mockTx, mockSendMail, mockRenderTemplate };
});

vi.mock('@/db', () => ({ db: mockDb }));
vi.mock('@/services/mail', () => ({ sendMail: mockSendMail, renderTemplate: mockRenderTemplate }));
vi.mock('@/utils/url', () => ({ getBaseUrl: vi.fn().mockReturnValue('https://example.com') }));

import { createManager } from '@/controllers/users/create';

function mockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    session: { user: { id: 1, role: 'manager', estateId: 5 } } as any,
    params: {},
    body: {},
    ...overrides,
  };
}

function mockRes(): Partial<Response> {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn(),
    redirect: vi.fn(),
  };
}

const validBody = { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com', estateId: '5' };

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.transaction.mockImplementation(async (cb: any) => cb(mockTx));
  mockTx.insert.mockReturnThis();
  mockTx.values.mockReturnThis();
  mockSendMail.mockResolvedValue(undefined);
  mockRenderTemplate.mockResolvedValue('<html>');
});

describe('createManager', () => {
  it('runs the transaction and redirects to /manager/people for a manager caller', async () => {
    mockTx.returning.mockResolvedValueOnce([{ id: 42, firstName: 'Jane', lastName: 'Smith' }]);
    const req = mockReq({ body: validBody });
    const res = mockRes();

    await createManager(req as Request, res as Response);

    expect(mockDb.transaction).toHaveBeenCalled();
    expect(mockTx.returning).toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/people');
  });

  it('redirects to /admin/estates/:id when the caller is an admin', async () => {
    mockTx.returning.mockResolvedValueOnce([{ id: 42 }]);
    const req = mockReq({
      session: { user: { id: 1, role: 'admin', estateId: null } } as any,
      body: { ...validBody, estateId: '7' },
    });
    const res = mockRes();

    await createManager(req as Request, res as Response);

    expect(res.redirect).toHaveBeenCalledWith('/admin/estates/7');
  });

  it('returns 400 when the schema is invalid', async () => {
    const req = mockReq({ body: { firstName: '', lastName: 'Smith', email: 'jane@example.com', estateId: '5' } });
    const res = mockRes();

    await createManager(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller role is not manager or admin', async () => {
    const req = mockReq({
      session: { user: { id: 1, role: 'guest', estateId: 5 } } as any,
      body: validBody,
    });
    const res = mockRes();

    await createManager(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('still redirects when the activation email fails to send', async () => {
    mockTx.returning.mockResolvedValueOnce([{ id: 42 }]);
    mockSendMail.mockRejectedValueOnce(new Error('SMTP error'));
    const req = mockReq({ body: validBody });
    const res = mockRes();

    await createManager(req as Request, res as Response);

    expect(res.redirect).toHaveBeenCalledWith('/manager/people');
  });
});
