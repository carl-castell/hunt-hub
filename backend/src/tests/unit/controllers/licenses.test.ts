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
  getHuntingLicense,
  postCreateHuntingLicense,
  postCheckHuntingLicense,
  postDeleteHuntingLicense,
  postUpdateHuntingLicense,
  getTrainingCertificate,
  postCreateTrainingCertificate,
  postCheckTrainingCertificate,
  postDeleteTrainingCertificate,
  postUpdateTrainingCertificate,
} from '@/controllers/licenses';

// ── Fixtures ──────────────────────────────────────────────────────────────────

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

const fakeAttachment = {
  id: 1, key: 's3/license.pdf', contentType: 'application/pdf',
  originalName: 'license.pdf', sizeBytes: 1024, uploadDate: new Date(),
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

// ── getHuntingLicense ─────────────────────────────────────────────────────────

describe('getHuntingLicense', () => {
  it('renders the license view with the latest license when no licenseId query param', async () => {
    // Queries: getGuestRow (limit), fallback license (orderBy→limit), attachments (orderBy terminal)
    mockDb.limit
      .mockResolvedValueOnce([fakeGuestDbRow])
      .mockResolvedValueOnce([fakeLicense]);
    mockDb.orderBy
      .mockReturnValueOnce(mockDb)                    // fallback license chain (non-terminal)
      .mockResolvedValueOnce([fakeAttachment]);        // attachments (terminal)

    const req = makeReq();
    const res = makeRes();
    await getHuntingLicense(req, res);

    expect(res.render).toHaveBeenCalledWith(
      'manager/guests/hunting-license',
      expect.objectContaining({ guest: expect.objectContaining({ firstName: 'Alice' }) }),
    );
  });

  it('renders the license view for a specific licenseId query param', async () => {
    // Queries: getGuestRow (limit), requested license (limit), attachments (orderBy terminal)
    mockDb.limit
      .mockResolvedValueOnce([fakeGuestDbRow])
      .mockResolvedValueOnce([fakeLicense]);
    mockDb.orderBy.mockResolvedValueOnce([fakeAttachment]);

    const req = makeReq({ query: { licenseId: '10' } });
    const res = makeRes();
    await getHuntingLicense(req, res);

    expect(res.render).toHaveBeenCalledWith('manager/guests/hunting-license', expect.anything());
  });

  it('returns 404 when the guest is not found', async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const res = makeRes();
    await getHuntingLicense(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('redirects to the guest page when no license exists', async () => {
    mockDb.limit
      .mockResolvedValueOnce([fakeGuestDbRow])
      .mockResolvedValueOnce([]);

    const res = makeRes();
    await getHuntingLicense(makeReq(), res);

    expect(res.redirect).toHaveBeenCalledWith('/manager/guests/5');
  });

  it('returns 500 on a DB error', async () => {
    mockDb.limit.mockRejectedValueOnce(new Error('DB error'));

    const res = makeRes();
    await getHuntingLicense(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── postCreateHuntingLicense ──────────────────────────────────────────────────

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

// ── postCheckHuntingLicense ───────────────────────────────────────────────────

describe('postCheckHuntingLicense', () => {
  it('marks the license as checked and redirects (no old licenses to delete)', async () => {
    // where calls: getGuestRow (non-terminal), license fetch (non-terminal), allLicenses (terminal)
    mockDb.where
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb)
      .mockResolvedValueOnce([fakeLicense]);
    mockDb.limit
      .mockResolvedValueOnce([fakeGuestDbRow])
      .mockResolvedValueOnce([fakeLicense]);

    const req = makeReq({ body: { licenseId: 10 } });
    const res = makeRes();
    await postCheckHuntingLicense(req, res);

    expect(mockDb.transaction).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/guests/5');
  });

  it('deletes old licenses and their S3 files when checking in a new license', async () => {
    const { deleteFile } = await import('@/services/storage');
    const fakeOldLicense = { id: 9, userId: 5, estateId: 1, expiryDate: '2020-01-01' };
    mockDb.where
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb)
      .mockResolvedValueOnce([fakeLicense, fakeOldLicense])
      .mockResolvedValueOnce([{ key: 's3/old.pdf' }]);
    mockDb.limit
      .mockResolvedValueOnce([fakeGuestDbRow])
      .mockResolvedValueOnce([fakeLicense]);

    const req = makeReq({ body: { licenseId: 10 } });
    const res = makeRes();
    await postCheckHuntingLicense(req, res);

    expect(mockTx.delete).toHaveBeenCalled();
    expect(vi.mocked(deleteFile)).toHaveBeenCalledWith('s3/old.pdf');
  });

  it('returns 404 when the guest is not found', async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const res = makeRes();
    await postCheckHuntingLicense(makeReq({ body: { licenseId: 10 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 when licenseId is missing from the body', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeGuestDbRow]);

    const res = makeRes();
    await postCheckHuntingLicense(makeReq({ body: {} }), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when the license belongs to a different user', async () => {
    const wrongLicense = { ...fakeLicense, userId: 99 };
    mockDb.where
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb);
    mockDb.limit
      .mockResolvedValueOnce([fakeGuestDbRow])
      .mockResolvedValueOnce([wrongLicense]);

    const res = makeRes();
    await postCheckHuntingLicense(makeReq({ body: { licenseId: 10 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── postDeleteHuntingLicense ──────────────────────────────────────────────────

describe('postDeleteHuntingLicense', () => {
  it('deletes the license and redirects to the guest page', async () => {
    // where calls: getGuestRow (non-terminal), license fetch (non-terminal),
    //              deleteLicense attachments (terminal), deleteLicense delete (void)
    mockDb.where
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb)
      .mockResolvedValueOnce([]);   // no attachments to delete from S3
    mockDb.limit
      .mockResolvedValueOnce([fakeGuestDbRow])
      .mockResolvedValueOnce([fakeLicense]);

    const req = makeReq({ body: { licenseId: 10 } });
    const res = makeRes();
    await postDeleteHuntingLicense(req, res);

    expect(res.redirect).toHaveBeenCalledWith('/manager/guests/5');
  });

  it('returns 404 when the guest is not found', async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const res = makeRes();
    await postDeleteHuntingLicense(makeReq({ body: { licenseId: 10 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 when licenseId is missing', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeGuestDbRow]);

    const res = makeRes();
    await postDeleteHuntingLicense(makeReq({ body: {} }), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when the license is not found', async () => {
    mockDb.where
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb);
    mockDb.limit
      .mockResolvedValueOnce([fakeGuestDbRow])
      .mockResolvedValueOnce([]);

    const res = makeRes();
    await postDeleteHuntingLicense(makeReq({ body: { licenseId: 10 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── postUpdateHuntingLicense ──────────────────────────────────────────────────

describe('postUpdateHuntingLicense', () => {
  it('updates the expiry date and redirects to the license view', async () => {
    mockDb.limit
      .mockResolvedValueOnce([fakeGuestDbRow])
      .mockResolvedValueOnce([fakeLicense]);

    const req = makeReq({ body: { licenseId: 10, expiryDate: '2030-06-01' } });
    const res = makeRes();
    await postUpdateHuntingLicense(req, res);

    expect(mockDb.update).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/guests/5/hunting-license?licenseId=10');
  });

  it('returns 404 when the guest is not found', async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const res = makeRes();
    await postUpdateHuntingLicense(makeReq({ body: { licenseId: 10, expiryDate: '2030-06-01' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 when licenseId is missing', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeGuestDbRow]);

    const res = makeRes();
    await postUpdateHuntingLicense(makeReq({ body: { expiryDate: '2030-06-01' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when the license is not found', async () => {
    mockDb.limit
      .mockResolvedValueOnce([fakeGuestDbRow])
      .mockResolvedValueOnce([]);

    const res = makeRes();
    await postUpdateHuntingLicense(makeReq({ body: { licenseId: 10, expiryDate: '2030-06-01' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 for a past expiry date', async () => {
    mockDb.limit
      .mockResolvedValueOnce([fakeGuestDbRow])
      .mockResolvedValueOnce([fakeLicense]);

    const req = makeReq({ body: { licenseId: 10, expiryDate: '2000-01-01' } });
    const res = makeRes();
    await postUpdateHuntingLicense(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('past'));
  });
});

// ── getTrainingCertificate ────────────────────────────────────────────────────

describe('getTrainingCertificate', () => {
  it('renders the certificate view with the latest cert', async () => {
    mockDb.limit
      .mockResolvedValueOnce([fakeGuestDbRow])
      .mockResolvedValueOnce([fakeCert]);
    mockDb.orderBy
      .mockReturnValueOnce(mockDb)
      .mockResolvedValueOnce([fakeAttachment]);

    const res = makeRes();
    await getTrainingCertificate(makeReq(), res);

    expect(res.render).toHaveBeenCalledWith('manager/guests/training-certificate', expect.anything());
  });

  it('returns 404 when the guest is not found', async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const res = makeRes();
    await getTrainingCertificate(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('redirects to the guest page when no certificate exists', async () => {
    mockDb.limit
      .mockResolvedValueOnce([fakeGuestDbRow])
      .mockResolvedValueOnce([]);

    const res = makeRes();
    await getTrainingCertificate(makeReq(), res);

    expect(res.redirect).toHaveBeenCalledWith('/manager/guests/5');
  });
});

// ── postCreateTrainingCertificate ─────────────────────────────────────────────

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

// ── postCheckTrainingCertificate ──────────────────────────────────────────────

describe('postCheckTrainingCertificate', () => {
  it('marks the certificate as checked and redirects', async () => {
    mockDb.where
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb)
      .mockResolvedValueOnce([fakeCert]);
    mockDb.limit
      .mockResolvedValueOnce([fakeGuestDbRow])
      .mockResolvedValueOnce([fakeCert]);

    const req = makeReq({ body: { certId: 20 } });
    const res = makeRes();
    await postCheckTrainingCertificate(req, res);

    expect(mockDb.transaction).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/guests/5');
  });

  it('returns 404 when the guest is not found', async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const res = makeRes();
    await postCheckTrainingCertificate(makeReq({ body: { certId: 20 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 when certId is missing', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeGuestDbRow]);

    const res = makeRes();
    await postCheckTrainingCertificate(makeReq({ body: {} }), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── postDeleteTrainingCertificate ─────────────────────────────────────────────

describe('postDeleteTrainingCertificate', () => {
  it('deletes the certificate and redirects to the guest page', async () => {
    mockDb.where
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb)
      .mockResolvedValueOnce([]);
    mockDb.limit
      .mockResolvedValueOnce([fakeGuestDbRow])
      .mockResolvedValueOnce([fakeCert]);

    const req = makeReq({ body: { certId: 20 } });
    const res = makeRes();
    await postDeleteTrainingCertificate(req, res);

    expect(res.redirect).toHaveBeenCalledWith('/manager/guests/5');
  });

  it('returns 404 when the guest is not found', async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const res = makeRes();
    await postDeleteTrainingCertificate(makeReq({ body: { certId: 20 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 when certId is missing', async () => {
    mockDb.limit.mockResolvedValueOnce([fakeGuestDbRow]);

    const res = makeRes();
    await postDeleteTrainingCertificate(makeReq({ body: {} }), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── postUpdateTrainingCertificate ─────────────────────────────────────────────

describe('postUpdateTrainingCertificate', () => {
  it('updates the issue date and redirects to the certificate view', async () => {
    mockDb.limit
      .mockResolvedValueOnce([fakeGuestDbRow])
      .mockResolvedValueOnce([fakeCert]);

    const req = makeReq({ body: { certId: 20, issueDate: '2021-06-01' } });
    const res = makeRes();
    await postUpdateTrainingCertificate(req, res);

    expect(mockDb.update).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/manager/guests/5/training-certificate?certId=20');
  });

  it('returns 404 when the guest is not found', async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const res = makeRes();
    await postUpdateTrainingCertificate(makeReq({ body: { certId: 20, issueDate: '2021-06-01' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 for a future issue date', async () => {
    mockDb.limit
      .mockResolvedValueOnce([fakeGuestDbRow])
      .mockResolvedValueOnce([fakeCert]);

    const req = makeReq({ body: { certId: 20, issueDate: '2099-01-01' } });
    const res = makeRes();
    await postUpdateTrainingCertificate(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('future'));
  });

  it('returns 404 when the certificate is not found', async () => {
    mockDb.limit
      .mockResolvedValueOnce([fakeGuestDbRow])
      .mockResolvedValueOnce([]);

    const res = makeRes();
    await postUpdateTrainingCertificate(makeReq({ body: { certId: 20, issueDate: '2021-06-01' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
