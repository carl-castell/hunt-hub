import { hostname } from 'os';
import type { Request, Response, NextFunction } from 'express';

/**
 * Which instance answered, for the local scaling demo (several app containers
 * behind nginx, see docker-compose.yml and scripts/scale-demo.ts).
 *
 * Only with SHOW_INSTANCE=true; production doesn't set it, so nothing changes
 * there. In Docker the hostname is the container id, unique per replica.
 */
export function instanceName(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.SHOW_INSTANCE === 'true' ? hostname() : null;
}

/** Adds `X-Instance: <hostname>` to every response when SHOW_INSTANCE=true. */
export function showInstance(_req: Request, res: Response, next: NextFunction) {
  const name = instanceName();
  if (name) res.setHeader('X-Instance', name);
  next();
}
