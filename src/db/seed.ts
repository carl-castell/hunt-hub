import 'dotenv/config';
import { db, pool } from './index';
import { usersTable } from './schema/users';
import { accountsTable } from './schema/accounts';
import bcrypt from 'bcrypt';
import * as readline from 'readline';
import { logError } from '@/utils/logError';

const SALT_ROUNDS = 10;

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

export async function runSeed() {
  console.log('> Seeding started');
  const startTime = Date.now();

  const [adminUser] = await db
    .insert(usersTable)
    .values({
      firstName: process.env.ADMIN_FIRST_NAME!,
      lastName: process.env.ADMIN_LAST_NAME!,
      role: 'admin',
    })
    .returning();

  await db.insert(accountsTable).values({
    userId: adminUser.id,
    email: process.env.ADMIN_EMAIL!,
    password: await bcrypt.hash(process.env.ADMIN_PASSWORD!, SALT_ROUNDS),
    active: true,
  });

  console.log(`  Admin user inserted (${process.env.ADMIN_EMAIL})`);

  if (process.env.SEED_MOCK_DATA === 'true') {
    console.log('> SEED_MOCK_DATA enabled — seeding mock data...');
    const { seedMockData } = await import('./seed.mock');
    await seedMockData();
  } else {
    console.log('> SEED_MOCK_DATA disabled — skipping mock data');
  }

  const duration = Date.now() - startTime;
  console.log('\n\x1b[32m%s\x1b[0m', `> Seeding finished (${duration} ms)\n`);
}

async function main() {
  console.log('\x1b[33m%s\x1b[0m', '⚠️  WARNING: This will insert seed data into the database.');
  console.log(`   DB_PROVIDER: ${process.env.DB_PROVIDER}`);
  console.log(`   Admin email: ${process.env.ADMIN_EMAIL}\n`);

  const confirmed = await confirm('Are you sure you want to continue? (y/N): ');
  if (!confirmed) {
    console.log('Aborted.');
    process.exit(0);
  }

  await runSeed();
}

if (require.main === module) {
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
}
