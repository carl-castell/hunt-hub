import dotenv from 'dotenv';
dotenv.config();

if (process.env.NODE_ENV === 'production' && process.env.SKIP_TOTP === 'true') {
  throw new Error('SKIP_TOTP=true is not allowed in production');
}

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