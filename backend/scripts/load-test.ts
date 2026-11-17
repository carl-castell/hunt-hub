/**
 * Load test for the area page's API call (manager.areas.get): the area with
 * its boundary as GeoJSON and its stands.
 *
 *   npx tsx scripts/load-test.ts setup     test estate, manager, area with a large boundary, stands (local DB)
 *   npx tsx scripts/load-test.ts run       measure against a running server (BASE_URL, default http://localhost:3002)
 *
 * The server must run with LOAD_TEST=true (turns rate limiting off; refused in
 * production and with any database other than the local one). See the backend
 * README, section "Load test".
 */
import 'dotenv/config'
import autocannon from 'autocannon'
import bcrypt from 'bcrypt'
import { eq, inArray, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '../src/db/schema/index.js'

const ESTATE = 'Load test estate'
const EMAIL = 'load-test-manager@local.test'
const PASSWORD = 'LoadTest-Local-Only-1'
const VERTICES = Number(process.env.VERTICES ?? 10_000)
const STANDS = Number(process.env.STANDS ?? 300)
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3002'
const DURATION = Number(process.env.DURATION ?? 20)
const CONNECTIONS = Number(process.env.CONNECTIONS ?? 20)

function localDb() {
  if (process.env.DB_PROVIDER !== 'local' || !process.env.LOCAL_DATABASE_URL) {
    throw new Error('The load test only runs against the local database (DB_PROVIDER=local).')
  }
  const pool = new Pool({ connectionString: process.env.LOCAL_DATABASE_URL })
  return { pool, db: drizzle(pool, { schema }) }
}

/** A wobbly circle with `n` vertices, like a real forest boundary from a GIS file. */
function boundaryWkt(n: number, [lng, lat]: [number, number], radius: number): string {
  const points: string[] = []
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n
    const r = radius * (1 + 0.08 * Math.sin(a * 23) + 0.04 * Math.sin(a * 97))
    points.push(`${(lng + r * Math.cos(a)).toFixed(7)} ${(lat + r * Math.sin(a) * 0.63).toFixed(7)}`)
  }
  points.push(points[0])
  return `MULTIPOLYGON(((${points.join(',')})))`
}

async function setup() {
  const { pool, db } = localDb()
  const s = schema

  // Start clean: the previous test estate with its users and areas.
  const old = await db.select({ id: s.estatesTable.id }).from(s.estatesTable).where(eq(s.estatesTable.name, ESTATE))
  if (old.length) {
    const ids = old.map((e) => e.id)
    await db.delete(s.areasTable).where(inArray(s.areasTable.estateId, ids))
    await db.delete(s.usersTable).where(inArray(s.usersTable.estateId, ids))
    await db.delete(s.estatesTable).where(inArray(s.estatesTable.id, ids))
  }

  const [estate] = await db.insert(s.estatesTable).values({ name: ESTATE }).returning()
  const [user] = await db.insert(s.usersTable)
    .values({ firstName: 'Load', lastName: 'Test', role: 'manager', estateId: estate.id }).returning()
  await db.insert(s.accountsTable).values({ userId: user.id, email: EMAIL, password: await bcrypt.hash(PASSWORD, 10), active: true })

  const centre: [number, number] = [10.5, 51.5]
  const [area] = await db.insert(s.areasTable).values({
    estateId: estate.id, name: 'Load test area',
    geofile: sql`ST_GeomFromText(${boundaryWkt(VERTICES, centre, 0.03)}, 4326)` as never,
  }).returning({ id: s.areasTable.id })

  for (let i = 1; i <= STANDS; i++) {
    const a = Math.random() * 2 * Math.PI
    const r = Math.sqrt(Math.random()) * 0.025
    await db.insert(s.standsTable).values({
      areaId: area.id, number: String(i),
      location: sql`ST_SetSRID(ST_MakePoint(${centre[0] + r * Math.cos(a)}, ${centre[1] + r * Math.sin(a) * 0.63}), 4326)` as never,
    })
  }

  console.log(`Created area ${area.id}: boundary with ${VERTICES} vertices, ${STANDS} stands. Manager: ${EMAIL}`)
  await pool.end()
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/v1/trpc/auth.login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const cookie = res.headers.get('set-cookie')?.split(';')[0]
  if (!res.ok || !cookie) throw new Error(`Login failed (${res.status}). Did you run "setup" and start the server with LOAD_TEST=true?`)
  return cookie
}

async function run() {
  const { pool, db } = localDb()
  const [area] = await db.select({ id: schema.areasTable.id }).from(schema.areasTable).where(eq(schema.areasTable.name, 'Load test area'))
  await pool.end()
  if (!area) throw new Error('No test area. Run "setup" first.')

  const cookie = await login()
  const url = `${BASE_URL}/api/v1/trpc/manager.areas.get?input=${encodeURIComponent(JSON.stringify({ id: area.id }))}`

  console.log(`GET manager.areas.get (area ${area.id}), ${CONNECTIONS} connections, ${DURATION} s …`)
  const result = await autocannon({ url, connections: CONNECTIONS, duration: DURATION, headers: { cookie } })

  const rows = {
    'requests/s (mean)': result.requests.average.toFixed(1),
    'latency p50 (ms)': result.latency.p50,
    'latency p97.5 (ms)': result.latency.p97_5,
    'latency p99 (ms)': result.latency.p99,
    'requests total': result.requests.total,
    'non-2xx responses': result.non2xx,
    errors: result.errors,
    'response size (KB)': (result.throughput.average / Math.max(result.requests.average, 1) / 1024).toFixed(0),
  }
  console.table(rows)
}

const command = process.argv[2]
const main = command === 'setup' ? setup : command === 'run' ? run : null
if (!main) console.log('Usage: npx tsx scripts/load-test.ts setup | run')
else main().catch((err) => { console.error(err); process.exit(1) })
