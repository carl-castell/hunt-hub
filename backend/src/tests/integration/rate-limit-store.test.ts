import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { like } from 'drizzle-orm';
import type { Options } from 'express-rate-limit';
import { db } from '@/db';
import { rateLimitsTable } from '@/db/schema';
import { PostgresRateLimitStore } from '@/middlewares/postgresRateLimitStore';

const PREFIX = 'test-store';

function storeWithWindow(windowMs: number, prefix = PREFIX) {
  const store = new PostgresRateLimitStore(prefix);
  store.init({ windowMs } as Options);
  return store;
}

async function cleanup() {
  await db.delete(rateLimitsTable).where(like(rateLimitsTable.key, `${PREFIX}%`));
}

beforeEach(cleanup);
afterAll(cleanup);

describe('PostgresRateLimitStore', () => {
  it('counts the hits of a key within the window', async () => {
    const store = storeWithWindow(60_000);
    expect((await store.increment('1.2.3.4')).totalHits).toBe(1);
    expect((await store.increment('1.2.3.4')).totalHits).toBe(2);
    const third = await store.increment('1.2.3.4');
    expect(third.totalHits).toBe(3);
    expect(third.resetTime!.getTime()).toBeGreaterThan(Date.now());
  });

  it('shares one counter between instances (two app servers count together)', async () => {
    const serverA = storeWithWindow(60_000);
    const serverB = storeWithWindow(60_000);
    await serverA.increment('5.6.7.8');
    await serverB.increment('5.6.7.8');
    expect((await serverA.increment('5.6.7.8')).totalHits).toBe(3);
  });

  it('counts concurrent requests without losing any', async () => {
    const store = storeWithWindow(60_000);
    await Promise.all(Array.from({ length: 20 }, () => store.increment('9.9.9.9')));
    expect((await store.get('9.9.9.9'))?.totalHits).toBe(20);
  });

  it('keeps limiters apart by their prefix', async () => {
    const login = storeWithWindow(60_000, `${PREFIX}-login`);
    const general = storeWithWindow(60_000, `${PREFIX}-general`);
    await login.increment('1.1.1.1');
    expect((await general.increment('1.1.1.1')).totalHits).toBe(1);
  });

  it('starts again at 1 after the window has passed', async () => {
    const store = storeWithWindow(50);
    await store.increment('2.2.2.2');
    await store.increment('2.2.2.2');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect((await store.increment('2.2.2.2')).totalHits).toBe(1);
    expect(await storeWithWindow(50).get('2.2.2.2')).toMatchObject({ totalHits: 1 });
  });

  it('decrements and resets a key', async () => {
    const store = storeWithWindow(60_000);
    await store.increment('3.3.3.3');
    await store.increment('3.3.3.3');
    await store.decrement('3.3.3.3');
    expect((await store.get('3.3.3.3'))?.totalHits).toBe(1);
    await store.resetKey('3.3.3.3');
    expect(await store.get('3.3.3.3')).toBeUndefined();
  });
});
