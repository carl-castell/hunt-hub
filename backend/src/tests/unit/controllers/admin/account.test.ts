import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

const { mockDb, mockBcryptCompare, mockBcryptHash, mockIsPasswordPwned } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
  mockBcryptCompare: vi.fn(),
  mockBcryptHash: vi.fn().mockResolvedValue('newhash'),
  mockIsPasswordPwned: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/db', () => ({ db: mockDb }));
vi.mock('@/services/audit', () => ({ audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/services/hibp', () => ({ isPasswordPwned: mockIsPasswordPwned }));
vi.mock('@/app', () => ({ sessionPool: { query: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('bcrypt', () => ({ default: { compare: mockBcryptCompare, hash: mockBcryptHash } }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import { getAccount, postChangePassword } from '@/controllers/admin/account';

const sessionUser = { id: 1, role: 'admin' as const, estateId: null };
const fakeFullUser = { id: 1, firstName: 'Admin', lastName: 'User', role: 'admin' };
const fakeAccount = { password: 'oldhash', userId: 1 };
const validBody = { oldPassword: 'OldPass1!', newPassword: 'NewPass1!', confirmPassword: 'NewPass1!' };

function mockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    session: {
      user: sessionUser,
      destroy: vi.fn().mockImplementation((cb: any) => cb()),
    } as any,
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.where.mockReturnThis();
  mockDb.update.mockReturnThis();
  mockDb.set.mockReturnThis();
  mockBcryptHash.mockResolvedValue('newhash');
  mockIsPasswordPwned.mockResolvedValue(false);
});

describe('getAccount', () => {
  it('renders the account page when the user is found', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeFullUser]);
    const req = mockReq();
    const res = mockRes();

    await getAccount(req as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith('admin/account', expect.objectContaining({ fullUser: fakeFullUser }));
  });

  it('returns 404 when the user is not found', async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const req = mockReq();
    const res = mockRes();

    await getAccount(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 when the DB throws', async () => {
    mockDb.limit.mockRejectedValueOnce(new Error('DB error'));
    const req = mockReq();
    const res = mockRes();

    await getAccount(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('postChangePassword', () => {
  it('renders with a validation error when the body is invalid', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeFullUser]); // renderAccount fullUser lookup
    const req = mockReq({ body: {} });
    const res = mockRes();

    await postChangePassword(req as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith('admin/account', expect.objectContaining({ error: expect.any(String) }));
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the account is not found', async () => {
    mockDb.limit.mockResolvedValueOnce([]); // account lookup
    const req = mockReq({ body: validBody });
    const res = mockRes();

    await postChangePassword(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('renders with an error when the account has no password set', async () => {
    mockDb.limit.mockResolvedValueOnce([{ password: null, userId: 1 }]); // account
    mockDb.limit.mockResolvedValueOnce([fakeFullUser]);                   // renderAccount fullUser
    const req = mockReq({ body: validBody });
    const res = mockRes();

    await postChangePassword(req as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith('admin/account', expect.objectContaining({ error: expect.stringContaining('activation link') }));
  });

  it('renders with an error when the old password is incorrect', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeAccount]);  // account
    mockBcryptCompare.mockResolvedValueOnce(false);
    mockDb.limit.mockResolvedValueOnce([fakeFullUser]); // renderAccount fullUser
    const req = mockReq({ body: validBody });
    const res = mockRes();

    await postChangePassword(req as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith('admin/account', expect.objectContaining({ error: expect.stringContaining('incorrect') }));
  });

  it('renders with an error when the new password is pwned', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeAccount]);  // account
    mockBcryptCompare.mockResolvedValueOnce(true);
    mockIsPasswordPwned.mockResolvedValueOnce(true);
    mockDb.limit.mockResolvedValueOnce([fakeFullUser]); // renderAccount fullUser
    const req = mockReq({ body: validBody });
    const res = mockRes();

    await postChangePassword(req as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith('admin/account', expect.objectContaining({ error: expect.stringContaining('breach') }));
  });

  it('updates the password and redirects to /login on success', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeAccount]); // account
    mockBcryptCompare.mockResolvedValueOnce(true);
    const req = mockReq({ body: validBody });
    const res = mockRes();

    await postChangePassword(req as Request, res as Response);

    expect(mockDb.update).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/login');
  });

  it('returns 500 when the DB throws unexpectedly', async () => {
    mockDb.limit.mockRejectedValueOnce(new Error('DB error'));
    const req = mockReq({ body: validBody });
    const res = mockRes();

    await postChangePassword(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
