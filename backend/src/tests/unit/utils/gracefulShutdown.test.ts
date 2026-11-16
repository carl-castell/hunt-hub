import { describe, it, expect, vi, afterEach } from 'vitest';
import { installGracefulShutdown } from '@/utils/gracefulShutdown';

const closingServer = (err?: Error) => ({
  close: vi.fn((callback?: (err?: Error) => void) => { callback?.(err); return undefined as never; }),
});

afterEach(() => {
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('SIGINT');
  vi.useRealTimers();
});

describe('installGracefulShutdown', () => {
  it('closes the server first, then every resource, then exits with 0', async () => {
    const order: string[] = [];
    const server = { close: vi.fn((cb?: (err?: Error) => void) => { order.push('server'); cb?.(); return undefined as never; }) };
    const exit = vi.fn();
    const shutdown = installGracefulShutdown(server, [
      { name: 'database pool', close: async () => { order.push('database pool'); } },
      { name: 'session pool', close: async () => { order.push('session pool'); } },
    ], { exit, log: () => {} });

    await shutdown('SIGTERM');

    expect(order).toEqual(['server', 'database pool', 'session pool']);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('shuts down only once, even if the signal arrives twice', async () => {
    const server = closingServer();
    const exit = vi.fn();
    const shutdown = installGracefulShutdown(server, [], { exit, log: () => {} });

    await shutdown('SIGTERM');
    await shutdown('SIGINT');

    expect(server.close).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
  });

  it('exits with 1 when closing fails', async () => {
    const exit = vi.fn();
    const shutdown = installGracefulShutdown(closingServer(), [
      { name: 'database pool', close: async () => { throw new Error('boom'); } },
    ], { exit, log: () => {} });

    await shutdown('SIGTERM');

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('exits with 1 when closing hangs longer than the timeout', async () => {
    vi.useFakeTimers();
    const exit = vi.fn();
    const hangingServer = { close: vi.fn(() => undefined as never) }; // never calls back
    const shutdown = installGracefulShutdown(hangingServer, [], { exit, timeoutMs: 1000, log: () => {} });

    void shutdown('SIGTERM');
    await vi.advanceTimersByTimeAsync(1000);

    expect(exit).toHaveBeenCalledWith(1);
  });
});
