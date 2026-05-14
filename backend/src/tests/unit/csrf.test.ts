import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { generateCsrfToken, verifyCsrfToken, verifyCsrfTokenMultipart } from '@/middlewares/csrf';

function mockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    method: 'GET',
    headers: {},
    body: {},
    session: {} as any,
    ...overrides,
  };
}

function mockRes(): Partial<Response> & { locals: Record<string, unknown> } {
  return {
    locals: {},
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
}

function mockNext(): NextFunction {
  return vi.fn();
}

describe('generateCsrfToken', () => {
  it('creates a new token when none exists on the session', () => {
    const req = mockReq({ session: {} as any });
    const res = mockRes();
    const next = mockNext();

    generateCsrfToken(req as Request, res as Response, next);

    expect((req.session as any).csrfToken).toMatch(/^[0-9a-f]{64}$/);
    expect(res.locals.csrfToken).toBe((req.session as any).csrfToken);
    expect(next).toHaveBeenCalled();
  });

  it('reuses an existing token rather than overwriting it', () => {
    const existingToken = 'a'.repeat(64);
    const req = mockReq({ session: { csrfToken: existingToken } as any });
    const res = mockRes();
    const next = mockNext();

    generateCsrfToken(req as Request, res as Response, next);

    expect((req.session as any).csrfToken).toBe(existingToken);
    expect(res.locals.csrfToken).toBe(existingToken);
  });

  it('calls next()', () => {
    const req = mockReq({ session: {} as any });
    const res = mockRes();
    const next = mockNext();

    generateCsrfToken(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledOnce();
  });
});

describe('verifyCsrfToken', () => {
  it('skips verification for non-POST methods', () => {
    for (const method of ['GET', 'PUT', 'DELETE', 'HEAD']) {
      const req = mockReq({ method });
      const res = mockRes();
      const next = mockNext();

      verifyCsrfToken(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.send).not.toHaveBeenCalled();
    }
  });

  it('skips verification when NODE_ENV is test', () => {
    // NODE_ENV is already "test" in the unit test environment
    const req = mockReq({ method: 'POST', session: {} as any });
    const res = mockRes();
    const next = mockNext();

    verifyCsrfToken(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it('skips verification for multipart/form-data content-type', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const req = mockReq({
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data; boundary=abc' },
        session: {} as any,
      });
      const res = mockRes();
      const next = mockNext();

      verifyCsrfToken(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('accepts a valid token from req.body._csrf', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const token = 'valid-token';
      const req = mockReq({
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: { _csrf: token },
        session: { csrfToken: token } as any,
      });
      const res = mockRes();
      const next = mockNext();

      verifyCsrfToken(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('accepts a valid token from x-csrf-token header', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const token = 'valid-token';
      const req = mockReq({
        method: 'POST',
        headers: { 'x-csrf-token': token },
        session: { csrfToken: token } as any,
      });
      const res = mockRes();
      const next = mockNext();

      verifyCsrfToken(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('returns 403 when token is missing', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const req = mockReq({
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: {},
        session: { csrfToken: 'correct-token' } as any,
      });
      const res = mockRes();
      const next = mockNext();

      verifyCsrfToken(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Invalid CSRF token');
      expect(next).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('returns 403 when token does not match session', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const req = mockReq({
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: { _csrf: 'wrong-token' },
        session: { csrfToken: 'correct-token' } as any,
      });
      const res = mockRes();
      const next = mockNext();

      verifyCsrfToken(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });
});

describe('verifyCsrfTokenMultipart', () => {
  it('skips verification when NODE_ENV is test', () => {
    const req = mockReq({ method: 'POST', session: {} as any });
    const res = mockRes();
    const next = mockNext();

    verifyCsrfTokenMultipart(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it('returns 403 when token is missing in production', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const req = mockReq({
        method: 'POST',
        body: {},
        session: { csrfToken: 'correct-token' } as any,
      });
      const res = mockRes();
      const next = mockNext();

      verifyCsrfTokenMultipart(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('accepts valid token from body in production', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const token = 'valid-token';
      const req = mockReq({
        method: 'POST',
        body: { _csrf: token },
        session: { csrfToken: token } as any,
      });
      const res = mockRes();
      const next = mockNext();

      verifyCsrfTokenMultipart(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });
});
