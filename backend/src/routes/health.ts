import express, { Router, Request, Response } from 'express';

/** Any cheap query against the database, e.g. `SELECT 1`. */
export type DatabasePing = () => Promise<unknown>;

/** A database that answers slower than this counts as unavailable. */
const DATABASE_TIMEOUT_MS = 2000;

async function databaseIsReachable(ping: DatabasePing): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('database timeout')), DATABASE_TIMEOUT_MS);
  });
  try {
    await Promise.race([ping(), timeout]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /health for load balancers, Render and Docker: 200 when the app can
 * reach its database, 503 otherwise. No session, no authentication, no
 * details beyond the status of each dependency.
 */
export function createHealthRouter(ping: DatabasePing): Router {
  const router = express.Router();

  router.get('/health', async (_req: Request, res: Response) => {
    const database = (await databaseIsReachable(ping)) ? 'ok' : 'unreachable';
    const healthy = database === 'ok';
    res
      .status(healthy ? 200 : 503)
      .set('Cache-Control', 'no-store')
      .json({ status: healthy ? 'ok' : 'error', checks: { database }, uptimeSeconds: Math.round(process.uptime()) });
  });

  return router;
}
