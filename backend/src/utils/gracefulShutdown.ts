import type { Server } from 'http';

type Closable = { name: string; close: () => Promise<unknown> };

type ShutdownOptions = {
  /** Give up and exit with an error if closing takes longer than this. */
  timeoutMs?: number;
  log?: (message: string) => void;
  exit?: (code: number) => void;
};

/**
 * On SIGTERM (Render, Docker stop) or SIGINT (Ctrl+C): stop accepting new
 * connections, let running requests finish, close the given resources
 * (database pools), then exit. Without this, every deploy cuts off the
 * requests that are running at that moment.
 *
 * Returns the shutdown function (used directly in tests).
 */
export function installGracefulShutdown(
  server: Pick<Server, 'close'> & Partial<Pick<Server, 'closeIdleConnections'>>,
  resources: Closable[],
  { timeoutMs = 10_000, log = console.log, exit = process.exit }: ShutdownOptions = {},
): (signal: string) => Promise<void> {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`[server]: ${signal} received, shutting down`);

    const forceExit = setTimeout(() => {
      log(`[server]: shutdown took longer than ${timeoutMs} ms, exiting anyway`);
      exit(1);
    }, timeoutMs);
    forceExit.unref();

    try {
      const closed = new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      // Idle keep-alive connections would otherwise hold close() open until the timeout.
      server.closeIdleConnections?.();
      await closed;
      for (const resource of resources) {
        await resource.close();
        log(`[server]: closed ${resource.name}`);
      }
      clearTimeout(forceExit);
      log('[server]: shutdown complete');
      exit(0);
    } catch (err) {
      clearTimeout(forceExit);
      log(`[server]: shutdown failed: ${err instanceof Error ? err.message : String(err)}`);
      exit(1);
    }
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
  return shutdown;
}
