import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const provider = process.env.DB_PROVIDER ?? 'local';
const url =
  process.env.DATABASE_URL ??
  (provider === 'neon' ? process.env.NEON_DATABASE_URL! : process.env.LOCAL_DATABASE_URL!);

console.log('Drizzle CLI provider:', provider);
console.log('Drizzle CLI URL:', url);

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: { url },
  extensionsFilters: ['postgis'],
  tablesFilter: ['!session'],
});
