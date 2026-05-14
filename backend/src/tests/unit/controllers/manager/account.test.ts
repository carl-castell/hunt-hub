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

import { getAccount, postChangePassword, postGenerateWfsToken, postDeleteWfsToken } from '@/controllers/manager/account';

const sessionUser = { id: 1, role: 'manager' as const, estateId: 5 };
const fakeFullUser = { id: 1, firstName: 'Jane', lastName: 'Smith', role: 'manager', estateId: 5 };
const fakeAccount  = { password: 'oldhash', userId: 1, wfsToken: null };
const validPasswordBody = { oldPassword: 'OldPass1!', newPassword: 'NewPass1!', confirmPassword: 'NewPass1!' };

function mockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    session: { user: sessionUser, destroy: vi.fn().mockImplementation((cb: any) => cb()) } as any,
    body: {},
    params: {},
    ip: '127.0.0.1',
    protocol: 'http',
    get: vi.fn().mockReturnValue('localhost:3000'),
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
  mockDb.update.mockReturnThis();
  mockDb.set.mockReturnThis();
  mockBcryptHash.mockResolvedValue('newhash');
  mockIsPasswordPwned.mockResolvedValue(false);
});

// ---------------------------------------------------------------------------
// getAccount
// ---------------------------------------------------------------------------

describe('getAccount', () => {
  it('renders the account page', async () => {
    // Promise.all → two limit() calls in order
    mockDb.limit
      .mockResolvedValueOnce([fakeFullUser])
      .mockResolvedValueOnce([{ wfsToken: 'tok' }]);
    const res = mockRes();

    await getAccount(mockReq() as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith('manager/account', expect.objectContaining({ fullUser: fakeFullUser, wfsToken: 'tok' }));
  });

  it('returns 404 when the user is not found', async () => {
    mockDb.limit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ wfsToken: null }]);
    const res = mockRes();

    await getAccount(mockReq() as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 when the DB throws', async () => {
    mockDb.limit.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();

    await getAccount(mockReq() as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---------------------------------------------------------------------------
// postChangePassword
// ---------------------------------------------------------------------------

describe('postChangePassword', () => {
  it('returns 404 when the user is not found', async () => {
    mockDb.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([fakeAccount]);
    const res = mockRes();

    await postChangePassword(mockReq({ body: validPasswordBody }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('renders with error for invalid body', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeFullUser]).mockResolvedValueOnce([fakeAccount]);
    const res = mockRes();

    await postChangePassword(mockReq({ body: {} }) as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith('manager/account', expect.objectContaining({ error: expect.any(String) }));
  });

  it('renders with error when account has no password', async () => {
    mockDb.limit
      .mockResolvedValueOnce([fakeFullUser])
      .mockResolvedValueOnce([{ ...fakeAccount, password: null }]);
    const res = mockRes();

    await postChangePassword(mockReq({ body: validPasswordBody }) as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith('manager/account', expect.objectContaining({ error: expect.stringContaining('activation link') }));
  });

  it('renders with error when old password is incorrect', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeFullUser]).mockResolvedValueOnce([fakeAccount]);
    mockBcryptCompare.mockResolvedValueOnce(false);
    const res = mockRes();

    await postChangePassword(mockReq({ body: validPasswordBody }) as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith('manager/account', expect.objectContaining({ error: expect.stringContaining('incorrect') }));
  });

  it('renders with error when new password is pwned', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeFullUser]).mockResolvedValueOnce([fakeAccount]);
    mockBcryptCompare.mockResolvedValueOnce(true);
    mockIsPasswordPwned.mockResolvedValueOnce(true);
    const res = mockRes();

    await postChangePassword(mockReq({ body: validPasswordBody }) as Request, res as Response);

    expect(res.render).toHaveBeenCalledWith('manager/account', expect.objectContaining({ error: expect.stringContaining('breach') }));
  });

  it('updates the password and redirects to /login on success', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeFullUser]).mockResolvedValueOnce([fakeAccount]);
    mockBcryptCompare.mockResolvedValueOnce(true);
    const res = mockRes();

    await postChangePassword(mockReq({ body: validPasswordBody }) as Request, res as Response);

    expect(mockDb.update).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/login');
  });

  it('returns 500 when the DB throws', async () => {
    mockDb.limit.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();

    await postChangePassword(mockReq({ body: validPasswordBody }) as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---------------------------------------------------------------------------
// postGenerateWfsToken
// ---------------------------------------------------------------------------

describe('postGenerateWfsToken', () => {
  it('generates a token, re-renders the account page with newWfsToken', async () => {
    // update().set().where() uses default where (mockReturnThis)
    // then Promise.all → two limit() calls
    mockDb.limit
      .mockResolvedValueOnce([fakeFullUser])
      .mockResolvedValueOnce([{ wfsToken: 'newtoken' }]);
    const res = mockRes();

    await postGenerateWfsToken(mockReq() as Request, res as Response);

    expect(mockDb.update).toHaveBeenCalled();
    expect(res.render).toHaveBeenCalledWith('manager/account', expect.objectContaining({ newWfsToken: expect.any(String) }));
  });

  it('returns 500 when the DB throws', async () => {
    mockDb.where.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();

    await postGenerateWfsToken(mockReq() as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---------------------------------------------------------------------------
// postDeleteWfsToken
// ---------------------------------------------------------------------------

describe('postDeleteWfsToken', () => {
  it('clears the token and redirects to account page', async () => {
    const res = mockRes();

    await postDeleteWfsToken(mockReq() as Request, res as Response);

    expect(mockDb.update).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/account');
  });

  it('returns 500 when the DB throws', async () => {
    mockDb.where.mockRejectedValueOnce(new Error('DB error'));
    const res = mockRes();

    await postDeleteWfsToken(mockReq() as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
