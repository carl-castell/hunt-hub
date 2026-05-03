import 'dotenv/config';
import { db, pool } from './index';
import { usersTable } from './schema/users';
import { accountsTable } from './schema/accounts';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import bcrypt from 'bcrypt';
import * as readline from 'readline';
import { logError } from '@/utils/logError';

const SALT_ROUNDS = 10;

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function main() {
  console.log('\x1b[33m%s\x1b[0m', '⚠️  WARNING: This will delete all data and reseed the database.');
  console.log(`   DB_PROVIDER: ${process.env.DB_PROVIDER}`);
  console.log(`   Admin email: ${process.env.ADMIN_EMAIL}\n`);

  const confirmed = await confirm('Are you sure you want to continue? (y/N): ');
  if (!confirmed) {
    console.log('Aborted.');
    process.exit(0);
  }

  console.log('> dropping schema objects...');
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
  for (const stmt of drops) {
    await db.execute(sql.raw(stmt));
  }
  console.log('> schema objects dropped\n');

  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis`);
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  console.log('> PostGIS + pg_trgm extensions enabled');

  console.log('> syncing schema...');
  const migUrl = process.env.DB_PROVIDER === 'neon'
    ? process.env.NEON_DATABASE_URL!
    : process.env.LOCAL_DATABASE_URL!;
  const migPool = new Pool({ connectionString: migUrl });
  try {
    await migrate(drizzlePg(migPool), { migrationsFolder: './drizzle' });
  } finally {
    await migPool.end();
  }
  console.log('> schema sync complete\n');

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS areas_geofile_gist ON areas USING GIST (geofile)
  `);
  console.log('> GIST index created on areas.geofile');

  console.log('> seeding started');
  const startTime = Date.now();

  const [adminUser] = await db
    .insert(usersTable)
    .values({
      firstName: process.env.ADMIN_FIRST_NAME!,
      lastName: process.env.ADMIN_LAST_NAME!,
      role: 'admin',
    })
    .returning();

  await db
    .insert(accountsTable)
    .values({
      userId: adminUser.id,
      email: process.env.ADMIN_EMAIL!,
      password: await bcrypt.hash(process.env.ADMIN_PASSWORD!, SALT_ROUNDS),
      active: true,
    });

  console.log('  Admin user inserted');

  if (process.env.SEED_MOCK_DATA === 'true') {
    console.log('> SEED_MOCK_DATA enabled — seeding mock data...');
    const { seedMockData } = await import('./seed.mock');
    await seedMockData();
  } else {
    console.log('> SEED_MOCK_DATA disabled — skipping mock data');
  }

  const endTime = Date.now();
  const duration = endTime - startTime;
  console.log('\n \x1b[32m%s\x1b[0m', `\n> seeding finished (${duration} ms) \n`);
}

main()
  .then(async () => {
    if (pool) await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    logError('[error]', err);
    if (pool) await pool.end();
    process.exit(1);
  });
