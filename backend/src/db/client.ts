import * as schema from './schema';

// Local (Docker) client: node-postgres
import { Pool } from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';

// Neon serverless client: neon + neon-http
import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';


const provider = process.env.DB_PROVIDER ?? 'local';


let db:
  | ReturnType<typeof drizzlePg>
  | ReturnType<typeof drizzleNeon>;

let pool: Pool | null = null;

if (provider === 'neon') {
  const url = process.env.NEON_DATABASE_URL!;
  const sql = neon(url);
  db = drizzleNeon(sql, { schema });
} else {
  const url = process.env.LOCAL_DATABASE_URL!;
  pool = new Pool({
    connectionString: url,
    ssl: false, // local Docker typically has no SSL
  });
  db = drizzlePg(pool, { schema });
}

export { db, pool };
export type Db = typeof db;
export default db;
