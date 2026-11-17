import { Request, Response, NextFunction, RequestHandler } from 'express';
import { authLimiter, backupCodeLimiter, rsvpLimiter, rsvpUploadLimiter } from './rateLimiter';

/**
 * Brute-force protection for the tRPC login procedures and the guests'
 * public answer page, with the same limits as the old server-rendered forms.
 */
export const TRPC_AUTH_LIMITS: Record<string, RequestHandler> = {
  'auth.login': authLimiter,
  'auth.verifyTotp': authLimiter,
  'auth.confirmTotpSetup': authLimiter,
  'auth.useBackupCode': backupCodeLimiter,
  'mobile.auth.login': authLimiter,
  'rsvp.open': rsvpLimiter,
  'rsvp.respond': rsvpLimiter,
  'rsvp.uploadLicence': rsvpUploadLimiter,
  'rsvp.uploadCertificate': rsvpUploadLimiter,
  'rsvp.saveDetails': rsvpUploadLimiter,
};

/** The procedures of a tRPC request; a batch looks like "/auth.login,auth.me". */
function proceduresOf(req: Request): string[] {
  return req.path.replace(/^\//, '').split(',').filter(Boolean);
}

/**
 * Builds a middleware that applies the limiter once per call of a protected
 * procedure, so batching many login attempts into one HTTP request cannot
 * get around the limit.
 */
export function createTrpcAuthLimiter(limits: Record<string, RequestHandler>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const limiters = proceduresOf(req)
      .map((procedure) => limits[procedure])
      .filter((limiter): limiter is RequestHandler => limiter !== undefined);

    const applyNext = (index: number) => {
      if (index === limiters.length) return next();
      // A limiter calls back only if the call is allowed; otherwise it answers 429 itself.
      void limiters[index](req, res, (err?: unknown) => (err ? next(err) : applyNext(index + 1)));
    };
    applyNext(0);
  };
}

export const limitTrpcAuthAttempts = createTrpcAuthLimiter(TRPC_AUTH_LIMITS);
