import dotenv from 'dotenv';
dotenv.config();

if (process.env.NODE_ENV === 'production' && process.env.SKIP_TOTP === 'true') {
  throw new Error('SKIP_TOTP=true is not allowed in production');
}

import app from './app';

const domain = process.env.DOMAIN || 'http://localhost:3000';
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`[server]: Server is running at ${domain}`);
  if (process.env.MAIL_PROVIDER === 'local') {
    console.log(`[mail]:   Mailpit web UI at http://localhost:8025`);
  }
});