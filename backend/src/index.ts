import dotenv from 'dotenv';
dotenv.config();

if (process.env.NODE_ENV === 'production' && process.env.SKIP_TOTP === 'true') {
  throw new Error('SKIP_TOTP=true is not allowed in production');
}

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be at least 32 characters');
}

const dbProvider = process.env.DB_PROVIDER;
if (!dbProvider) throw new Error('DB_PROVIDER is required');
if (dbProvider === 'neon' && !process.env.NEON_DATABASE_URL) throw new Error('NEON_DATABASE_URL is required when DB_PROVIDER=neon');
if (dbProvider === 'local' && !process.env.LOCAL_DATABASE_URL) throw new Error('LOCAL_DATABASE_URL is required when DB_PROVIDER=local');

if (!process.env.MAIL_FROM) throw new Error('MAIL_FROM is required');
// Without MAIL_PROVIDER the app sends with Mailgun, which otherwise fails deep inside its library.
if ((process.env.MAIL_PROVIDER ?? 'mailgun') !== 'local' && (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN)) {
  throw new Error('MAILGUN_API_KEY and MAILGUN_DOMAIN are required unless MAIL_PROVIDER=local');
}

import app, { sessionPool } from './app';
import { pool } from './db';
import { installGracefulShutdown } from './utils/gracefulShutdown';
import { logger } from './utils/logger';

const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

const server = app.listen(port, () => {
  const displayUrl = isProduction
    ? process.env.DOMAIN
    : `http://localhost:${port}`;
  logger.info({ url: displayUrl, port }, 'Server is running');
  if (process.env.MAIL_PROVIDER === 'local') {
    logger.info('Mailpit web UI at http://localhost:8025');
  }
});

installGracefulShutdown(server, [
  { name: 'database pool', close: () => pool.end() },
  { name: 'session store pool', close: () => sessionPool.end() },
], { log: (message) => logger.info(message) });
