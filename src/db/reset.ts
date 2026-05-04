import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as readline from 'readline';
import { db, pool } from './index';
import { runSeed } from './seed';
import { logError } from '@/utils/logError';

const drops = [
  `DROP TABLE IF EXISTS session CASCADE`,
  `DROP TABLE IF EXISTS drive_stand_assignments CASCADE`,
  `DROP TABLE IF EXISTS drive_groups CASCADE`,
  `DROP TABLE IF EXISTS template_stand_assignments CASCADE`,
  `DROP TABLE IF EXISTS template_groups CASCADE`,
  `DROP TABLE IF EXISTS templates CASCADE`,
  `DROP TABLE IF EXISTS training_certificate_attachments CASCADE`,
  `DROP TABLE IF EXISTS hunting_license_attachments CASCADE`,
  `DROP TABLE IF EXISTS training_certificates CASCADE`,
  `DROP TABLE IF EXISTS hunting_licenses CASCADE`,
  `DROP TABLE IF EXISTS drives CASCADE`,
  `DROP TABLE IF EXISTS stands CASCADE`,
  `DROP TABLE IF EXISTS areas CASCADE`,
  `DROP TABLE IF EXISTS invitations CASCADE`,
  `DROP TABLE IF EXISTS events CASCADE`,
  `DROP TABLE IF EXISTS user_auth_tokens CASCADE`,
  `DROP TABLE IF EXISTS audit_logs CASCADE`,
  `DROP TABLE IF EXISTS guest_group_members CASCADE`,
  `DROP TABLE IF EXISTS guest_groups CASCADE`,
  `DROP TABLE IF EXISTS accounts CASCADE`,
  `DROP TABLE IF EXISTS contacts CASCADE`,
  `DROP TABLE IF EXISTS users CASCADE`,
  `DROP TABLE IF EXISTS estates CASCADE`,
  `DROP TABLE IF EXISTS totp_backup_codes CASCADE`,
  `DROP TABLE IF EXISTS __drizzle_migrations CASCADE`,
  `DROP SCHEMA IF EXISTS drizzle CASCADE`,
  `DROP TYPE IF EXISTS role CASCADE`,
  `DROP TYPE IF EXISTS invitation_response CASCADE`,
  `DROP TYPE IF EXISTS invitation_status CASCADE`,
  `DROP TYPE IF EXISTS attachment_kind CASCADE`,
  `DROP TYPE IF EXISTS token_type CASCADE`,
];

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function main() {
  console.log('\x1b[33m%s\x1b[0m', '⚠️  WARNING: This will delete all data, reset the database, and reseed.');
  console.log(`   DB_PROVIDER: ${process.env.DB_PROVIDER}\n`);

  const confirmed = await confirm('Are you sure you want to continue? (y/N): ');
  if (!confirmed) {
    console.log('Aborted.');
    process.exit(0);
  }

  console.log('> Dropping schema objects...');
  for (const stmt of drops) {
    await db.execute(sql.raw(stmt));
  }
  console.log('> Schema objects dropped\n');

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

  await runSeed();

  console.log('\n\x1b[32m%s\x1b[0m', '> Reset complete.\n');
}

main()
  .then(async () => {
    if (pool) await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    logError('[reset error]', err);
    if (pool) await pool.end();
    process.exit(1);
  });
