// src/db/index.ts
import 'dotenv/config';
import * as schema from './schema';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

const provider = process.env.DB_PROVIDER ?? 'local';

const pool = new Pool(
  provider === 'neon'
    ? { connectionString: process.env.NEON_DATABASE_URL!, ssl: true }
    : { connectionString: process.env.LOCAL_DATABASE_URL!, ssl: false }
);

const db = drizzle(pool, { schema });

export { db, pool };
export type Db = typeof db;
export default db;
