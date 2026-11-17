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
 * Settings that weaken login are for local development only. The server
 * refuses to start with them in production, and with DEV_LOGIN on any other
 * database than the local one, so a forgotten variable can't open a back door.
 */
export function assertSafeLoginSettings(env: Env = process.env): void {
  if (env.NODE_ENV === 'production') {
    if (env.SKIP_TOTP === 'true') throw new Error('SKIP_TOTP=true is not allowed in production')
    if (env.DEV_LOGIN === 'true') throw new Error('DEV_LOGIN=true is not allowed in production')
  }
  if (env.DEV_LOGIN === 'true' && env.DB_PROVIDER !== 'local') {
    throw new Error(`DEV_LOGIN=true is only allowed with DB_PROVIDER=local (found: ${env.DB_PROVIDER ?? 'not set'})`)
  }
}
