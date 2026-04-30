import 'dotenv/config';
import { Pool, PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, asc, eq, ilike, notInArray, or } from 'drizzle-orm';
import * as schema from '../src/db/schema/index.js';

// Own pool — script always runs against local DB
const pgPool = new Pool({ connectionString: process.env.LOCAL_DATABASE_URL });
const db = drizzle(pgPool, { schema });

// ── query builders (mirrors the actual controller queries) ─────────────────

function pickerSearchQuery(estateId: number, term: string) {
  return db
    .select()
    .from(schema.contactsTable)
    .innerJoin(schema.usersTable, eq(schema.contactsTable.userId, schema.usersTable.id))
    .where(and(
      eq(schema.usersTable.estateId, estateId),
      or(
        ilike(schema.usersTable.firstName, `%${term}%`),
        ilike(schema.usersTable.lastName, `%${term}%`),
      ),
    ))
    .orderBy(asc(schema.usersTable.lastName), asc(schema.usersTable.firstName))
    .limit(51);
}

function pickerAllGuestsQuery(estateId: number, excludeIds: number[]) {
  const base = and(
    eq(schema.usersTable.estateId, estateId),
    eq(schema.usersTable.role, 'guest'),
  );
  return db
    .select()
    .from(schema.contactsTable)
    .innerJoin(schema.usersTable, eq(schema.contactsTable.userId, schema.usersTable.id))
    .where(excludeIds.length > 0 ? and(base, notInArray(schema.usersTable.id, excludeIds)) : base)
    .orderBy(asc(schema.usersTable.lastName), asc(schema.usersTable.firstName))
    .limit(51);
}

function invitationsByEventStatusQuery(eventId: number) {
  return db
    .select()
    .from(schema.invitationsTable)
    .where(and(
      eq(schema.invitationsTable.eventId, eventId),
      eq(schema.invitationsTable.status, 'staged'),
    ));
}

function eventsByEstateQuery(estateId: number) {
  return db
    .select()
    .from(schema.eventsTable)
    .where(eq(schema.eventsTable.estateId, estateId));
}

// ── explain helpers ────────────────────────────────────────────────────────

function parseTime(plan: string): number {
  const m = plan.match(/Execution Time:\s*([\d.]+)\s*ms/);
  return m ? parseFloat(m[1]) : 0;
}

function parsePages(plan: string): number {
  let total = 0;
  for (const m of plan.matchAll(/shared hit=(\d+)(?:\s+read=(\d+))?/g)) {
    total += parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) : 0);
  }
  return total;
}

function parseScanType(plan: string): string {
  if (/Bitmap Index Scan/i.test(plan)) return 'Bitmap Index Scan';
  if (/Index Only Scan/i.test(plan))   return 'Index Only Scan';
  if (/Index Scan/i.test(plan))        return 'Index Scan';
  return 'Seq Scan';
}

async function explainQuery(client: PoolClient, querySql: string, params: unknown[]): Promise<string> {
  const res = await client.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${querySql}`,
    params as unknown[],
  );
  return (res.rows as Array<{ 'QUERY PLAN': string }>).map(r => r['QUERY PLAN']).join('\n');
}

interface QuerySpec {
  label: string;
  drizzleQuery: { toSQL(): { sql: string; params: unknown[] } };
  primaryTable: string;
}

async function measure(spec: QuerySpec, rowCounts: Record<string, number>) {
  const { sql: querySql, params } = spec.drizzleQuery.toSQL();
  const client = await pgPool.connect();
  try {
    await client.query(`ANALYZE ${spec.primaryTable}`);

    // Without indexes — force sequential scan
    await client.query('BEGIN');
    await client.query('SET LOCAL enable_indexscan = off');
    await client.query('SET LOCAL enable_bitmapscan = off');
    const planWithout = await explainQuery(client, querySql, params);
    await client.query('ROLLBACK');

    // With indexes — normal plan
    const planWith = await explainQuery(client, querySql, params);

    const withoutTime  = parseTime(planWithout);
    const withTime     = parseTime(planWith);

    return {
      label:        spec.label,
      withoutTime,
      withTime,
      withoutPages: parsePages(planWithout),
      withPages:    parsePages(planWith),
      scanWith:     parseScanType(planWith),
      speedup:      withTime > 0 ? Math.round(withoutTime / withTime) : 1,
      tooFewRows:   (rowCounts[spec.primaryTable] ?? 0) < 100,
    };
  } finally {
    client.release();
  }
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  const client = await pgPool.connect();

  const estateRow = await client.query<{ id: number }>('SELECT id FROM estates LIMIT 1');
  const eventRow  = await client.query<{ id: number }>('SELECT id FROM events  LIMIT 1');
  const stagedRow = await client.query<{ user_id: number }>(
    'SELECT user_id FROM invitations WHERE event_id = $1 LIMIT 5',
    [eventRow.rows[0]?.id ?? 0],
  );

  const estateId  = estateRow.rows[0]?.id ?? 0;
  const eventId   = eventRow.rows[0]?.id  ?? 0;
  const stagedIds = stagedRow.rows.map(r => r.user_id);

  const rowCounts: Record<string, number> = {};
  for (const table of ['users', 'invitations', 'events']) {
    const r = await client.query<{ count: string }>(`SELECT COUNT(*) AS count FROM ${table}`);
    rowCounts[table] = parseInt(r.rows[0].count, 10);
  }
  client.release();

  // Row count summary
  console.log('\nTable row counts:');
  for (const [table, count] of Object.entries(rowCounts)) {
    const warn = count < 100 ? '  ⚠ too few rows — results may not be meaningful' : '';
    console.log(`  ${table.padEnd(16)} ${String(count).padStart(6)}${warn}`);
  }
  console.log();

  if (!estateId || !eventId) {
    console.log('⚠  No estate or event found. Run npm run db:seed first.\n');
    await pgPool.end();
    return;
  }
  if (rowCounts['users'] < 1000) {
    console.log('⚠  Fewer than 1 000 users — planner may prefer seq scans on small tables.');
    console.log('   Run the mock seeder with a higher guest count for more meaningful results.\n');
  }

  const queries: QuerySpec[] = [
    {
      label:        "Picker ILIKE search ('%son%')",
      drizzleQuery: pickerSearchQuery(estateId, 'son'),
      primaryTable: 'users',
    },
    {
      label:        'Picker all guests (role filter)',
      drizzleQuery: pickerAllGuestsQuery(estateId, stagedIds),
      primaryTable: 'users',
    },
    {
      label:        'Invitations by event + status',
      drizzleQuery: invitationsByEventStatusQuery(eventId),
      primaryTable: 'invitations',
    },
    {
      label:        'Events by estateId',
      drizzleQuery: eventsByEstateQuery(estateId),
      primaryTable: 'events',
    },
  ];

  const results = await Promise.all(queries.map(q => measure(q, rowCounts)));

  // Print results table
  const LW = 34, TW = 10, PW = 11;
  const header =
    'Query'.padEnd(LW) + ' │ ' +
    'Without index'.padEnd(TW + PW) + ' │ ' +
    'With index'.padEnd(TW + PW) + ' │ Speedup';
  console.log(header);
  console.log('─'.repeat(header.length));

  for (const r of results) {
    const without  = `${r.withoutTime.toFixed(1)} ms`.padEnd(TW) + `${r.withoutPages} pages`.padEnd(PW);
    const withIdx  = `${r.withTime.toFixed(1)} ms`.padEnd(TW)    + `${r.withPages} pages`.padEnd(PW);
    const speedStr = r.speedup > 1 ? `${r.speedup}x` : '~1x';
    const flag     = r.tooFewRows || r.scanWith === 'Seq Scan' ? '⚠' : '✅';
    console.log(
      r.label.padEnd(LW) + ' │ ' +
      without + ' │ ' +
      withIdx + ' │ ' +
      `${speedStr.padStart(4)}  ${flag} ${r.scanWith}`,
    );
  }

  console.log();
  console.log('Pages = 8 KB blocks touched (shared hit + shared read).');
  console.log('✅ = index used   ⚠ = seq scan (normal when table has < ~1 000 rows)\n');

  await pgPool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
