/**
 * Scaling benchmark: how do throughput and latency change with the number of
 * app instances behind the load balancer?
 *
 *   docker compose up -d && npm run db:migrate
 *   npx tsx scripts/load-test.ts setup        test manager and test area (local DB), once
 *   npx tsx scripts/scale-benchmark.ts        INSTANCES (default 1,2,3,4), RUNS (3), DURATION (20 s), CONNECTIONS (20)
 *
 * For each number of instances it starts the app with
 * `LOAD_TEST=true APP_INSTANCES=<n> docker compose --profile app up -d`, waits
 * until every instance answers, warms up every instance's boundary cache, then
 * measures manager.areas.get (the most expensive request) through the load
 * balancer RUNS times and prints the median run. Local only (LOAD_TEST turns
 * rate limiting off and is refused with any database but the local one).
 */
import 'dotenv/config'
import { execSync } from 'child_process'
import autocannon from 'autocannon'
import { cpus } from 'os'
import { Pool } from 'pg'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3001'
const INSTANCES = (process.env.INSTANCES ?? '1,2,3,4').split(',').map(Number)
const RUNS = Number(process.env.RUNS ?? 3)
const DURATION = Number(process.env.DURATION ?? 20)
const CONNECTIONS = Number(process.env.CONNECTIONS ?? 20)
const EMAIL = 'load-test-manager@local.test'
const PASSWORD = 'LoadTest-Local-Only-1'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function testAreaId(): Promise<number> {
  if (process.env.DB_PROVIDER !== 'local' || !process.env.LOCAL_DATABASE_URL) {
    throw new Error('The benchmark only runs against the local database (DB_PROVIDER=local).')
  }
  const pool = new Pool({ connectionString: process.env.LOCAL_DATABASE_URL })
  const { rows } = await pool.query(`SELECT id FROM areas WHERE name = 'Load test area' LIMIT 1`)
  await pool.end()
  if (!rows[0]) throw new Error('No test area. Run "npx tsx scripts/load-test.ts setup" first.')
  return rows[0].id
}

function startInstances(n: number) {
  execSync(`docker compose --profile app up -d --remove-orphans`, {
    env: { ...process.env, LOAD_TEST: 'true', APP_INSTANCES: String(n) },
    stdio: 'ignore',
  })
}

/** Waits until n different instances answer /health through the load balancer. */
async function waitForInstances(n: number) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const seen = new Set<string>()
    for (let i = 0; i < n * 6; i++) {
      try {
        const res = await fetch(`${BASE_URL}/health`)
        if (res.ok) seen.add(res.headers.get('x-instance') ?? '?')
      } catch { /* not up yet */ }
    }
    if (seen.size >= n) return
    await sleep(2000)
  }
  throw new Error(`Only some of the ${n} instances answer. Check "docker compose --profile app ps".`)
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/v1/trpc/auth.login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const cookie = res.headers.get('set-cookie')?.split(';')[0]
  if (!res.ok || !cookie) throw new Error(`Login failed (${res.status}). Did you run "npx tsx scripts/load-test.ts setup"?`)
  return cookie
}

type Run = { rps: number; p50: number; p99: number; errors: number }

async function measure(url: string, cookie: string, duration: number): Promise<Run> {
  const r = await autocannon({ url, connections: CONNECTIONS, duration, headers: { cookie } })
  return { rps: r.requests.average, p50: r.latency.p50, p99: r.latency.p99, errors: r.errors + r.non2xx }
}

const median = (runs: Run[]) => [...runs].sort((a, b) => a.rps - b.rps)[Math.floor(runs.length / 2)]

async function main() {
  const areaId = await testAreaId()
  const dockerCpus = execSync(`docker info --format '{{.NCPU}}'`).toString().trim()
  console.log(`Scaling benchmark: Docker ${dockerCpus} CPUs (Mac ${cpus().length} cores), ${CONNECTIONS} connections, ${RUNS} × ${DURATION} s per setting\n`)

  const rows: Record<string, string | number>[] = []
  let baseline = 0
  for (const n of INSTANCES) {
    process.stdout.write(`${n} instance(s): starting … `)
    startInstances(n)
    await waitForInstances(n)
    const cookie = await login()
    const url = `${BASE_URL}/api/v1/trpc/manager.areas.get?input=${encodeURIComponent(JSON.stringify({ id: areaId }))}`

    // Warm-up: fills every instance's boundary cache and JIT before measuring.
    await measure(url, cookie, 5)

    const runs: Run[] = []
    for (let i = 0; i < RUNS; i++) {
      process.stdout.write(`run ${i + 1} … `)
      runs.push(await measure(url, cookie, DURATION))
    }
    const m = median(runs)
    if (!baseline) baseline = m.rps
    console.log(`${m.rps.toFixed(0)} req/s`)
    rows.push({
      instances: n,
      'requests/s (median run)': Number(m.rps.toFixed(1)),
      'vs 1 instance': `${((m.rps / baseline) * 100).toFixed(0)} %`,
      'latency p50 (ms)': m.p50,
      'latency p99 (ms)': m.p99,
      'errors / non-2xx': m.errors,
      'all runs (req/s)': runs.map((r) => r.rps.toFixed(0)).join(', '),
    })
  }

  // Back to one instance with rate limiting on, like a normal start.
  execSync(`docker compose --profile app up -d --remove-orphans`, {
    env: { ...process.env, LOAD_TEST: 'false', APP_INSTANCES: '1' }, stdio: 'ignore',
  })

  console.log()
  console.table(rows)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
