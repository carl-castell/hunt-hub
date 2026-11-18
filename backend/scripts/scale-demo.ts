/**
 * Horizontal scaling demo: proves that several app instances behind the
 * load balancer behave like one, because they keep no state of their own.
 *
 *   npx tsx scripts/load-test.ts setup                     test manager (local DB), once
 *   APP_INSTANCES=3 docker compose --profile app up -d --build
 *   npx tsx scripts/scale-demo.ts                          BASE_URL, default http://localhost:3001
 *
 * Checks:
 *   1. Round robin: requests are spread over every instance (X-Instance header).
 *   2. Shared session: one login works on every instance (sessions in Postgres).
 *   3. Shared rate limit: 20 wrong logins are allowed in total, not 20 per
 *      instance, so the 21st is refused (counters in Postgres).
 *
 * Local only: it clears its own rate-limit counters in the local database.
 * See the backend README, section "Horizontal scaling demo".
 */
import 'dotenv/config'
import { Pool } from 'pg'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3001'
// The test manager created by `scripts/load-test.ts setup`.
const EMAIL = 'load-test-manager@local.test'
const PASSWORD = 'LoadTest-Local-Only-1'
const WRONG_EMAIL = 'scale-demo-nobody@local.test'
const AUTH_LIMIT = 20 // authLimiter in src/middlewares/rateLimiter.ts

type Result = { check: string; passed: boolean; detail: string }
const results: Result[] = []
const served = new Map<string, number>()

function instanceOf(res: Response): string {
  const name = res.headers.get('x-instance') ?? '(no X-Instance header)'
  served.set(name, (served.get(name) ?? 0) + 1)
  return name
}

function localPool(): Pool {
  if (process.env.DB_PROVIDER !== 'local' || !process.env.LOCAL_DATABASE_URL) {
    throw new Error('The scaling demo only runs against the local database (DB_PROVIDER=local).')
  }
  return new Pool({ connectionString: process.env.LOCAL_DATABASE_URL })
}

const login = (email: string, password: string) =>
  fetch(`${BASE_URL}/api/v1/trpc/auth.login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

async function roundRobin() {
  const seen = new Set<string>()
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${BASE_URL}/health`)
    if (!res.ok) throw new Error(`GET /health answered ${res.status}. Is "docker compose --profile app up" running?`)
    seen.add(instanceOf(res))
  }
  // Only a failure if more instances were asked for (APP_INSTANCES passed to this script too).
  const expected = Number(process.env.APP_INSTANCES ?? 1)
  results.push({
    check: '1. Round robin',
    passed: seen.size >= Math.min(expected, 20),
    detail: seen.size > 1
      ? `20 requests answered by ${seen.size} instances`
      : 'all requests answered by one instance (to see round robin, start more with APP_INSTANCES=3 for compose and this script)',
  })
  return seen.size
}

async function sharedSession() {
  const res = await login(EMAIL, PASSWORD)
  const cookie = res.headers.get('set-cookie')?.split(';')[0]
  if (!res.ok || !cookie) throw new Error(`Login failed (${res.status}). Did you run "npx tsx scripts/load-test.ts setup"?`)
  const loggedInAt = instanceOf(res)

  const answeredBy = new Set<string>()
  let ok = 0
  for (let i = 0; i < 10; i++) {
    const r = await fetch(`${BASE_URL}/api/v1/trpc/manager.areas.list`, { headers: { cookie } })
    answeredBy.add(instanceOf(r))
    if (r.ok) ok++
  }
  results.push({
    check: '2. Shared session',
    passed: ok === 10,
    detail: `logged in on ${loggedInAt}; ${ok}/10 requests with that cookie succeeded, on ${answeredBy.size} instance(s)`,
  })
}

async function sharedRateLimit(pool: Pool) {
  // Start from zero, so the demo can be repeated (only the auth counters).
  await pool.query(`DELETE FROM rate_limits WHERE key LIKE 'auth:%'`)

  const statuses: number[] = []
  const perInstance = new Map<string, number>()
  for (let i = 0; i <= AUTH_LIMIT; i++) {
    const res = await login(WRONG_EMAIL, 'wrong-password')
    statuses.push(res.status)
    const name = instanceOf(res)
    perInstance.set(name, (perInstance.get(name) ?? 0) + 1)
  }
  const refused = statuses[AUTH_LIMIT] === 429
  const allowedBefore = statuses.slice(0, AUTH_LIMIT).every((s) => s !== 429)
  const spread = [...perInstance.entries()].map(([n, c]) => `${n}: ${c}`).join(', ')
  results.push({
    check: '3. Shared rate limit',
    passed: refused && allowedBefore,
    detail: `${AUTH_LIMIT} wrong logins allowed, attempt ${AUTH_LIMIT + 1} → ${statuses[AUTH_LIMIT]} (attempts per instance: ${spread})`,
  })

  // Leave nothing behind that would block real logins from this machine.
  await pool.query(`DELETE FROM rate_limits WHERE key LIKE 'auth:%'`)
}

async function main() {
  const pool = localPool()
  try {
    console.log(`Scaling demo against ${BASE_URL}\n`)
    await roundRobin()
    await sharedSession()
    await sharedRateLimit(pool)
  } finally {
    await pool.end()
  }

  console.table(results.map((r) => ({ check: r.check, result: r.passed ? 'PASS' : 'FAIL', detail: r.detail })))
  console.log('Requests served per instance:')
  console.table(Object.fromEntries(served))

  if (results.some((r) => !r.passed)) process.exit(1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
