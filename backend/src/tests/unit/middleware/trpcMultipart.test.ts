import { describe, it, expect, vi } from 'vitest';
import { Request, Response } from 'express';
import { letTrpcReadMultipart } from '@/middlewares/trpcMultipart';

function reqWith(contentType: string, body: unknown) {
  return {
    body,
    is: (type: string) => (contentType.startsWith(type) ? type : false),
  } as unknown as Request;
}

describe('letTrpcReadMultipart', () => {
  it('removes the empty body placeholder from multipart requests', () => {
    const req = reqWith('multipart/form-data; boundary=x', {});
    const next = vi.fn();

    letTrpcReadMultipart(req, {} as Response, next);

    expect('body' in req).toBe(false);
    expect(next).toHaveBeenCalled();
  });

  it('keeps parsed JSON bodies', () => {
    const req = reqWith('application/json', { name: 'North' });

    letTrpcReadMultipart(req, {} as Response, vi.fn());

    expect(req.body).toEqual({ name: 'North' });
  });
});
