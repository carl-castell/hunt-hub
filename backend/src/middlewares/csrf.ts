import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export function generateCsrfToken(req: Request, res: Response, next: NextFunction) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

export function verifyCsrfToken(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'POST' || process.env.NODE_ENV === 'test') return next();
  const ct = req.headers['content-type'] ?? '';
  if (ct.includes('multipart/form-data')) return next(); // deferred to route level after multer
  const token = (req.body._csrf as string | undefined) ?? (req.headers['x-csrf-token'] as string | undefined);
  if (!token || token !== req.session.csrfToken) return res.status(403).send('Invalid CSRF token');
  next();
}

export function verifyCsrfTokenMultipart(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'test') return next();
  const token = (req.body._csrf as string | undefined) ?? (req.headers['x-csrf-token'] as string | undefined);
  if (!token || token !== req.session.csrfToken) return res.status(403).send('Invalid CSRF token');
  next();
}
