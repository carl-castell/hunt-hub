import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index';
import { logError } from '@/utils/logError';

async function main() {
  const migUrl = process.env.DB_PROVIDER === 'neon'
    ? process.env.NEON_DATABASE_URL!
    : process.env.LOCAL_DATABASE_URL!;

  console.log('> Enabling extensions...');
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis`);
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  console.log('> PostGIS + pg_trgm enabled');

  console.log('> Running migrations...');
  const migPool = new Pool({ connectionString: migUrl });
  try {
    await migrate(drizzlePg(migPool), { migrationsFolder: './drizzle' });
  } finally {
    await migPool.end();
  }
  console.log('> Migrations complete');

  console.log('> Creating indexes...');
  await db.execute(sql`CREATE INDEX IF NOT EXISTS areas_geofile_gist ON areas USING GIST (geofile)`);
  console.log('> Indexes created');
}

main()
  .then(async () => {
    if (pool) await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    logError('[migrate error]', err);
    if (pool) await pool.end();
    process.exit(1);
  });
