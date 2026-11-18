import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const { mockDb, mockTx } = vi.hoisted(() => {
  const mockTx = {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    delete: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn(),
  };
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    orderBy: vi.fn().mockReturnThis(),
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
vi.mock('@/services/storage', () => ({
  uploadFile: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/audit', () => ({ audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import {
  postCreateHuntingLicense,
  postCreateTrainingCertificate,
} from '@/controllers/licenses';

const sessionUser = { id: 1, role: 'manager' as const, estateId: 1, firstName: 'Jane', lastName: 'Smith', email: 'jane@test.com', active: true };

function makeReq(overrides: any = {}): Request {
  return {
    session: { user: sessionUser },
    params: { id: '5' },
    query: {},
    body: {},
    files: [],
    ip: '127.0.0.1',
    ...overrides,
  } as any;
}

function makeRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    render: vi.fn(),
    redirect: vi.fn(),
  } as any;
}

const fakeGuestDbRow = {
  users: { id: 5, firstName: 'Alice', lastName: 'Hunter', estateId: 1, role: 'guest' as const },
  contacts: { userId: 5, email: 'alice@test.com', phone: null, dateOfBirth: null },
};

const fakeLicense = {
  id: 10, userId: 5, estateId: 1,
  expiryDate: '2099-12-31', checked: false, checkedAt: null, uploadDate: new Date(),
};

const fakeCert = {
  id: 20, userId: 5, estateId: 1,
  issueDate: '2020-01-01', checked: false, checkedAt: null, uploadDate: new Date(),
};


const pdfFile: Express.Multer.File = {
  fieldname: 'licenseFiles', originalname: 'license.pdf', encoding: '7bit',
  mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.4'), size: 8,
  stream: null as any, destination: '', filename: '', path: '',
};

const jpegFile: Express.Multer.File = {
  ...pdfFile, fieldname: 'certFiles', originalname: 'photo.jpg',
  mimetype: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff]),
};

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
  mockDb.transaction.mockImplementation(async (cb: any) => cb(mockTx));
  mockTx.insert.mockReturnThis();
  mockTx.values.mockReturnThis();
  mockTx.delete.mockReturnThis();
  mockTx.update.mockReturnThis();
  mockTx.set.mockReturnThis();
});

describe('postCreateHuntingLicense', () => {
  it('creates a license, uploads the file and redirects', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeGuestDbRow]);
    mockTx.returning.mockResolvedValueOnce([fakeLicense]);

    const req = makeReq({ body: { expiryDate: '2099-12-31' }, files: [pdfFile] });
    const res = makeRes();
    await postCreateHuntingLicense(req, res);

    expect(mockDb.transaction).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/guests/5/hunting-license?licenseId=10');
  });

  it('returns 404 when the guest is not found', async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const res = makeRes();
    await postCreateHuntingLicense(makeReq({ body: { expiryDate: '2099-12-31' }, files: [pdfFile] }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 for a past expiry date', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeGuestDbRow]);

    const req = makeReq({ body: { expiryDate: '2000-01-01' }, files: [pdfFile] });
    const res = makeRes();
    await postCreateHuntingLicense(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('past'));
  });

  it('returns 400 when no files are provided', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeGuestDbRow]);

    const req = makeReq({ body: { expiryDate: '2099-12-31' }, files: [] });
    const res = makeRes();
    await postCreateHuntingLicense(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for a disallowed file type', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeGuestDbRow]);

    const csvFile = { ...pdfFile, mimetype: 'text/csv', originalname: 'data.csv' };
    const req = makeReq({ body: { expiryDate: '2099-12-31' }, files: [csvFile] });
    const res = makeRes();
    await postCreateHuntingLicense(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 500 on a DB error', async () => {
    mockDb.limit.mockRejectedValueOnce(new Error('DB error'));

    const res = makeRes();
    await postCreateHuntingLicense(makeReq({ body: { expiryDate: '2099-12-31' }, files: [pdfFile] }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('postCreateTrainingCertificate', () => {
  it('creates a certificate, uploads the file and redirects', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeGuestDbRow]);
    mockTx.returning.mockResolvedValueOnce([fakeCert]);

    const req = makeReq({ body: { issueDate: '2020-01-01' }, files: [jpegFile] });
    const res = makeRes();
    await postCreateTrainingCertificate(req, res);

    expect(mockDb.transaction).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/guests/5/training-certificate?certId=20');
  });

  it('returns 404 when the guest is not found', async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const res = makeRes();
    await postCreateTrainingCertificate(makeReq({ body: { issueDate: '2020-01-01' }, files: [jpegFile] }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 for a future issue date', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeGuestDbRow]);

    const req = makeReq({ body: { issueDate: '2099-01-01' }, files: [jpegFile] });
    const res = makeRes();
    await postCreateTrainingCertificate(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('future'));
  });

  it('returns 400 when no files are provided', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeGuestDbRow]);

    const req = makeReq({ body: { issueDate: '2020-01-01' }, files: [] });
    const res = makeRes();
    await postCreateTrainingCertificate(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
