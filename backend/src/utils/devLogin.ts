type Env = Record<string, string | undefined>

/**
 * Dev login (pick any user on the login page, no password) is only on when
 * DEV_LOGIN=true is set explicitly, never in production, and only with the
 * local database: a local server pointed at the production database (Neon)
 * must not offer it either.
 */
export function isDevLoginEnabled(env: Env = process.env): boolean {
  return env.DEV_LOGIN === 'true' && env.NODE_ENV !== 'production' && env.DB_PROVIDER === 'local'
}

/**
 * Load test mode turns rate limiting off, so a load test measures the server
 * and not the limiter. Same rules as the dev login: explicit, never in
 * production, only with the local database.
 */
export function isLoadTestMode(env: Env = process.env): boolean {
  return env.LOAD_TEST === 'true' && env.NODE_ENV !== 'production' && env.DB_PROVIDER === 'local'
}

/**
 * Settings that weaken protection (login, rate limits) are for local
 * development only. The server refuses to start with them in production, and
 * with DEV_LOGIN or LOAD_TEST on any other database than the local one, so a
 * forgotten variable can't open a back door.
 */
export function assertSafeLoginSettings(env: Env = process.env): void {
  if (env.NODE_ENV === 'production') {
    if (env.SKIP_TOTP === 'true') throw new Error('SKIP_TOTP=true is not allowed in production')
    if (env.DEV_LOGIN === 'true') throw new Error('DEV_LOGIN=true is not allowed in production')
    if (env.LOAD_TEST === 'true') throw new Error('LOAD_TEST=true is not allowed in production')
  }
  for (const name of ['DEV_LOGIN', 'LOAD_TEST']) {
    if (env[name] === 'true' && env.DB_PROVIDER !== 'local') {
      throw new Error(`${name}=true is only allowed with DB_PROVIDER=local (found: ${env.DB_PROVIDER ?? 'not set'})`)
    }
  }
}
