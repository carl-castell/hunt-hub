import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

const { mockDb, mockS3Send } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
  };
  const mockS3Send = vi.fn();
  return { mockDb, mockS3Send };
});

vi.mock('@/db', () => ({ db: mockDb }));
vi.mock('@/services/audit', () => ({ audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/services/storage', () => ({ s3: { send: mockS3Send }, BUCKET: 'test-bucket' }));
vi.mock('@aws-sdk/client-s3', () => ({ GetObjectCommand: vi.fn() }));

import { getFile } from '@/controllers/files';

function mockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    session: { user: { id: 1, role: 'manager', estateId: 10 } } as any,
    params: { 0: 'uploads/test.jpg' } as any,
    ip: '127.0.0.1',
    ...overrides,
  };
}

function mockRes(): Partial<Response> {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn(),
    setHeader: vi.fn(),
  };
}

const huntingAttachment = { key: 'uploads/test.jpg', contentType: 'image/jpeg', estateId: 10 };

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.innerJoin.mockReturnThis();
  mockDb.where.mockReturnThis();
});

describe('getFile', () => {
  it('streams the file when found in hunting attachments and estate matches', async () => {
    const mockPipe = vi.fn();
    mockDb.limit.mockResolvedValueOnce([huntingAttachment]);
    mockDb.limit.mockResolvedValueOnce([]);
    mockS3Send.mockResolvedValueOnce({ Body: { pipe: mockPipe }, ContentLength: 1024 });

    const req = mockReq();
    const res = mockRes();

    await getFile(req as Request, res as Response);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    expect(mockPipe).toHaveBeenCalledWith(res);
  });

  it('streams the file when found in certificate attachments', async () => {
    const mockPipe = vi.fn();
    const certAttachment = { key: 'uploads/test.jpg', contentType: 'application/pdf', estateId: 10 };
    mockDb.limit.mockResolvedValueOnce([]);
    mockDb.limit.mockResolvedValueOnce([certAttachment]);
    mockS3Send.mockResolvedValueOnce({ Body: { pipe: mockPipe }, ContentLength: 512 });

    const req = mockReq();
    const res = mockRes();

    await getFile(req as Request, res as Response);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(mockPipe).toHaveBeenCalled();
  });

  it('returns 404 when the file is not found in either table', async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    mockDb.limit.mockResolvedValueOnce([]);

    const req = mockReq();
    const res = mockRes();

    await getFile(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it('returns 403 when the file belongs to a different estate', async () => {
    const otherEstateAttachment = { ...huntingAttachment, estateId: 99 };
    mockDb.limit.mockResolvedValueOnce([otherEstateAttachment]);
    mockDb.limit.mockResolvedValueOnce([]);

    const req = mockReq();
    const res = mockRes();

    await getFile(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it('returns 404 when S3 throws NoSuchKey', async () => {
    mockDb.limit.mockResolvedValueOnce([huntingAttachment]);
    mockDb.limit.mockResolvedValueOnce([]);
    mockS3Send.mockRejectedValueOnce({ name: 'NoSuchKey' });

    const req = mockReq();
    const res = mockRes();

    await getFile(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
