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

import app from './app';

const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.listen(port, () => {
  const displayUrl = isProduction
    ? process.env.DOMAIN
    : `http://localhost:${port}`;
  console.log(`[server]: Server is running at ${displayUrl}`);
  if (process.env.MAIL_PROVIDER === 'local') {
    console.log(`[mail]:   Mailpit web UI at http://localhost:8025`);
  }
});