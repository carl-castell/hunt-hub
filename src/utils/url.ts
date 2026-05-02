import { Request } from 'express';

export function getBaseUrl(req: Request): string {
  if (process.env.NODE_ENV === 'production') {
    return process.env.DOMAIN!;
  }
  return `${req.protocol}://${req.get('host')}`;
}
