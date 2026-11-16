import { describe, it, expect, vi } from 'vitest';
import { Request, Response, RequestHandler } from 'express';
import { createTrpcAuthLimiter } from '@/middlewares/trpcAuthLimits';

/** A fake limiter that allows `allowed` calls, then answers 429 like express-rate-limit. */
function fakeLimiter(allowed: number) {
  let calls = 0;
  const limiter: RequestHandler = (_req, res, next) => {
    calls += 1;
    if (calls > allowed) return void res.status(429).send('Too many');
    next();
  };
  return { limiter, calls: () => calls };
}

const req = (path: string) => ({ path }) as Request;
const res = () => ({ status: vi.fn().mockReturnThis(), send: vi.fn() }) as unknown as Response;

describe('createTrpcAuthLimiter', () => {
  it('lets unprotected procedures through without counting', () => {
    const login = fakeLimiter(5);
    const next = vi.fn();

    createTrpcAuthLimiter({ 'auth.login': login.limiter })(req('/auth.me'), res(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(login.calls()).toBe(0);
  });

  it('counts a protected procedure', () => {
    const login = fakeLimiter(5);
    const next = vi.fn();

    createTrpcAuthLimiter({ 'auth.login': login.limiter })(req('/auth.login'), res(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(login.calls()).toBe(1);
  });

  it('counts every login in a batch, so batching cannot bypass the limit', () => {
    const login = fakeLimiter(2);
    const next = vi.fn();
    const response = res();

    createTrpcAuthLimiter({ 'auth.login': login.limiter })(req('/auth.login,auth.login,auth.login'), response, next);

    expect(login.calls()).toBe(3);
    expect(response.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });

  it('counts protected procedures inside a mixed batch', () => {
    const login = fakeLimiter(5);
    const next = vi.fn();

    createTrpcAuthLimiter({ 'auth.login': login.limiter })(req('/auth.me,auth.login'), res(), next);

    expect(login.calls()).toBe(1);
    expect(next).toHaveBeenCalledOnce();
  });
});
