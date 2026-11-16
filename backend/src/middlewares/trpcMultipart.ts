import { Request, Response, NextFunction } from 'express';

/**
 * Lets tRPC read multipart (FormData) uploads.
 *
 * Express's body parsers set `req.body = {}` on every request, even on
 * multipart ones they don't parse. tRPC's Express adapter uses `req.body`
 * whenever it is set, so it never reads the actual upload stream and fails
 * with "Failed to parse body as FormData". Removing the empty placeholder
 * for multipart requests makes tRPC read the stream itself.
 */
export function letTrpcReadMultipart(req: Request, _res: Response, next: NextFunction) {
  if (req.is('multipart/form-data')) delete (req as { body?: unknown }).body;
  next();
}
