import { sql } from 'drizzle-orm';
import type { IncrementResponse, Options, Store } from 'express-rate-limit';
import { db } from '@/db';

/** Delete expired counters every this many increments, so the table stays small. */
const CLEANUP_EVERY = 200;

/**
 * Rate limit counters in Postgres instead of each instance's memory.
 *
 * With the default memory store every app instance counts on its own, so
 * with two instances an attacker gets twice the login attempts. Here all
 * instances share one counter per key. Each increment is a single atomic
 * upsert, so concurrent requests can't lose a count, and an expired window
 * starts again at 1 in the same statement.
 */
export class PostgresRateLimitStore implements Store {
  /** Counters are shared by all instances, not local to this process. */
  localKeys = false
  prefix: string
  private windowMs = 60_000
  private increments = 0

  /** `prefix` keeps the limiters apart: they all count by the same client IP. */
  constructor(prefix: string) {
    this.prefix = `${prefix}:`
  }

  init(options: Options): void {
    this.windowMs = options.windowMs
  }

  private key(key: string) {
    return `${this.prefix}${key}`
  }

  async increment(key: string): Promise<IncrementResponse> {
    if (++this.increments % CLEANUP_EVERY === 0) await this.deleteExpired()
    const interval = `${this.windowMs} milliseconds`
    const result = await db.execute<{ hits: number; reset_at: Date | string }>(sql`
      INSERT INTO rate_limits (key, hits, reset_at)
      VALUES (${this.key(key)}, 1, now() + ${interval}::interval)
      ON CONFLICT (key) DO UPDATE SET
        hits     = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.hits + 1 END,
        reset_at = CASE WHEN rate_limits.reset_at <= now() THEN now() + ${interval}::interval ELSE rate_limits.reset_at END
      RETURNING hits, reset_at`)
    const row = result.rows[0]
    return { totalHits: Number(row.hits), resetTime: new Date(row.reset_at) }
  }

  async decrement(key: string): Promise<void> {
    await db.execute(sql`UPDATE rate_limits SET hits = GREATEST(hits - 1, 0) WHERE key = ${this.key(key)}`)
  }

  async resetKey(key: string): Promise<void> {
    await db.execute(sql`DELETE FROM rate_limits WHERE key = ${this.key(key)}`)
  }

  async get(key: string): Promise<IncrementResponse | undefined> {
    const result = await db.execute<{ hits: number; reset_at: Date | string }>(sql`
      SELECT hits, reset_at FROM rate_limits WHERE key = ${this.key(key)} AND reset_at > now()`)
    const row = result.rows[0]
    return row ? { totalHits: Number(row.hits), resetTime: new Date(row.reset_at) } : undefined
  }

  private async deleteExpired(): Promise<void> {
    await db.execute(sql`DELETE FROM rate_limits WHERE reset_at <= now()`)
  }
}
