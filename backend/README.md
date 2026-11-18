# Hunt Hub — Backend

> This is the `backend/` workspace of the [hunt-hub](https://github.com/carl-castell/hunt-hub) monorepo (with `web/`, the React app, and `mobile/`, the iPhone app). The backend serves the server-rendered pages, the APIs, and the built React app under `/app`. Use cases and all routes: [docs/USECASES.md](../docs/USECASES.md).

Hunting estate management platform. Managers organise hunts with their drives, build guest lists (single guests or whole groups), send email invitations and reminders with magic-link RSVPs, and check guest documents (hunting licences and training certificates). A separate admin surface manages estates and staff accounts.

---

## Contents

- **Overview:** [Tech Stack](#tech-stack) · [Architecture](#architecture) · [User Surfaces](#user-surfaces) · [Roles & Access](#roles--access)
- **Run it:** [Prerequisites](#prerequisites) · [Quick Start](#quick-start) · [Running the app in Docker](#running-the-app-in-docker) · [Environment Variables](#environment-variables) · [Scripts](#scripts)
- **Inside the code:** [Project Structure](#project-structure) · [Database and schema](#database-and-schema) · [Tests](#tests) · [Logging and monitoring](#logging-and-monitoring) · [Security](#security) · [Load test and caching](#load-test-and-caching) · [Horizontal scaling demo](#horizontal-scaling-demo) ([benchmark](#do-more-instances-mean-more-performance)) · [Routes Reference](#routes-reference)
- **Ship it:** [Development workflow](#development-workflow) · [Production Deployment](#production-deployment)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 with TypeScript (see `.node-version`) |
| Framework | Express.js |
| Database | PostgreSQL 16 + PostGIS (Docker locally, Neon in production) |
| ORM | Drizzle ORM |
| Web pages | Server-rendered EJS pages, plus the React app (`web/`) served under `/app`; both share one session and one menu |
| Auth | Session-based (express-session + connect-pg-simple) |
| Storage | AWS S3-compatible — RustFS locally (MinIO-compatible), Cloudflare R2 in production |
| Email | Nodemailer — Mailgun HTTP API in production, Mailpit locally |
| API layer | tRPC v11 at `/api/v1/trpc`: auth, admin and manager APIs for the React app (session cookie), mobile API for the iPhone app (bearer tokens) |
| Validation | Zod |
| Security | Helmet (CSP, HSTS, etc.), bcrypt, CSRF tokens, express-rate-limit (counters stored in Postgres), HIBP Pwned Passwords, per-account lockout, audit logging, session invalidation |
| Caching | In-memory LRU cache for area boundaries, keyed by `updated_at` (see "Load test and caching") |
| 2FA | TOTP via otpauth + qrcode (admin accounts) |
| GIS | OGC WFS-T 1.1.0 — QGIS and QField compatible |
| Logging | pino: one JSON line per request (request id, user, status, duration); secrets and personal data redacted |
| Deployment | Docker image (multi-stage, non-root), GitHub Actions CI/CD, Render (Docker runtime), Neon, Cloudflare R2, Mailgun (EU) |
| Testing | Vitest + Supertest (unit, integration, e2e, workers) |

---

## Architecture

One Express application (a modular monolith) in one Docker container serves every client. It keeps no state of its own: data, sessions, rate-limit counters and the mobile sync history are in PostgreSQL, so more instances can run side by side; locally this is shown with several instances behind an nginx load balancer (see "Horizontal scaling demo"). Production runs one instance on Render.

```mermaid
flowchart LR
  subgraph Clients
    browser["Browser<br/>React app (/app) and<br/>server-rendered pages"]
    iphone["iPhone app<br/>(offline-first, Expo)"]
    qgis["QGIS / QField"]
    guest["Guest<br/>(no account)"]
  end

  subgraph Render["Render: Docker container"]
    express["Express app<br/>Helmet, sessions, CSRF,<br/>rate limits, pino logging"]
    trpc["tRPC API /api/v1/trpc<br/>auth, admin, manager,<br/>mobile, rsvp"]
    pages["Server-rendered pages<br/>(EJS) and redirects"]
    wfs["WFS-T /wfs"]
    sync["Mobile sync<br/>(pull and push)"]
    services["Service layer<br/>areas, stands, events,<br/>invitations, documents, dashboard"]
    worker["Worker thread<br/>geo file parsing"]
    cache["Boundary cache<br/>(LRU, in memory)"]
  end

  db[("Neon: PostgreSQL + PostGIS<br/>data, sessions, rate limits,<br/>sync history")]
  r2[("Cloudflare R2<br/>licences, certificates")]
  mail["Mailgun<br/>invitations, activation"]

  browser -- "session cookie" --> express
  guest -- "magic link<br/>(invitation id from the email)" --> express
  mail -.->|invitation email| guest
  iphone -- "bearer token" --> express
  qgis -- "WFS token" --> express
  express --> trpc
  express --> pages
  express --> wfs
  trpc --> sync
  trpc --> services
  pages --> services
  wfs --> services
  sync --> db
  services --> cache
  services --> worker
  services --> db
  services --> r2
  services --> mail
```

**How a request flows:** the Express middleware stack (security headers, session, rate limit, request logging) runs first. tRPC procedures then check the role in the database and limit every query to the user's estate, validate the input with Zod, and call the service layer, which holds the business logic shared by the APIs and the server-rendered pages. Errors become typed tRPC codes, or `{ error: { code, message, requestId } }` from the central error handler (`src/middlewares/errorHandler.ts`).

**Deployment:** every pull request runs the CI pipeline (lint, type checks, all test suites, Docker image build with `/health` and shutdown check). A merge to `main` publishes the image to GitHub Container Registry, runs the migrations against Neon with that image, and Render deploys it after all checks have passed (see "Production Deployment").

---

## User Surfaces

| Surface | URL | Who uses it |
|---|---|---|
| Login | `/app/login` (`/` and `/login` redirect there) | Everyone |
| React app: admin area | `/app/admin` | Admins |
| React app: manager pages (dashboard, areas, events with guests and drives, document check) | `/app/manager/...` (`/manager` redirects to the dashboard) | Managers |
| Server-rendered manager pages (estate, guests, guest groups, staff, account) | `/manager/...` | Managers |
| Public RSVP | `/app/rsvp/:publicId` (React; email links `/rsvp/:publicId` redirect there) | Guests (magic link, no login) |
| RSVP preview | `/app/rsvp/preview/:eventId` | Managers |
| tRPC API | `/api/v1/trpc` | React app (cookie) and iPhone app (bearer token) |
| WFS endpoint | `/wfs` | QGIS / QField (token, OGC WFS-T 1.1.0), see [the QGIS guide](src/qgis/README.md) |
| Health check | `/health` | Render, Docker, CI |

Staff use the iPhone app only. The old server-rendered admin and login pages still exist but are no longer linked (HUN-51).

---

## Prerequisites

- Node.js 22 (`.node-version`; Vite 8 needs 22.12 or newer)
- Docker and Docker Compose (for local Postgres, file storage and Mailpit)
- A Mailgun account for production email, or Mailpit for local development

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/carl-castell/hunt-hub
cd hunt-hub
npm install          # installs all workspace dependencies from root

# 2. Move into the backend workspace
cd backend

# 3. Configure environment
cp .env.example .env
# edit .env — see Environment Variables below

# 4. Start Docker services (Postgres, test database, file storage, Mailpit)
docker compose up -d

# 5. Enable extensions, run migrations, and create indexes
npm run db:migrate

# 6. Seed the database (creates admin account + optional mock data)
npm run db:seed

# 7. Start the development server (readable log lines via LOG_PRETTY)
npm run dev
# → http://localhost:3000 (server-rendered pages + API)

# 8. In a second terminal: the React app with hot reload
cd ../web && npm run dev
# → http://localhost:5173/app/ (Vite forwards everything outside /app to :3000)
```

---

## Running the app in Docker

The repo-root `Dockerfile` builds one image with the backend and the built React app (multi-stage, runs as a non-root user, only production dependencies, no mobile packages). To run it locally with all services:

```bash
cd backend
docker compose --profile app up -d --build                       # http://localhost:3001 (one instance)
APP_INSTANCES=3 docker compose --profile app up -d --build       # three instances behind the load balancer
docker compose --profile app run --rm app node dist/src/db/migrate.js   # migrations, if needed
```

- The app containers have no port of their own: an nginx load balancer (`lb`, config in `loadbalancer/nginx.conf`) listens on `localhost:3001` and sends requests to the instances in turn. `APP_INSTANCES` (default 1) sets how many run; running the command again with another number adds or removes instances, and nginx picks them up within 5 seconds.
- The containers run with `SHOW_INSTANCE=true`, so every response has an `X-Instance` header with the container id.

- `GET /health` returns 200 when the database is reachable, otherwise 503 (used by Docker's `HEALTHCHECK`, Render and CI)
- On `SIGTERM` (e.g. `docker stop`, a Render deploy) the server stops accepting connections, finishes running requests and closes the database pools before exiting
- CI builds the image on every pull request and checks `/health` and the graceful shutdown

## Environment Variables

### Application

| Variable | Required | Description | Example |
|---|---|---|---|
| `NODE_ENV` | Yes | Runtime environment (the Docker image sets `production`) | `development` |
| `PORT` | No | HTTP port (default: 3000) | `3000` |
| `SESSION_SECRET` | Yes | Random string for session signing | `change-me-32-chars-min` |
| `DOMAIN` | Yes | Base URL used in email links and RSVP URLs | `http://localhost:3000` |
| `SKIP_TOTP` | No | Skip admin TOTP — dev/test only, **throws at startup if set in production** | `true` |
| `LOAD_TEST` | No | Load test mode: rate limiting off (see "Load test and caching"). Local only, **throws at startup in production or with any database other than `DB_PROVIDER=local`** | `true` |
| `DEV_LOGIN` | No | Dev login: the React login page lists all active admins and managers; one click logs in as that user, without password or TOTP. Local development only, **throws at startup in production or with any database other than `DB_PROVIDER=local`** (see below) | `true` |
| `WEB_DIST_DIR` | No | Where the built React app is (default `../web/dist`) | `/app/web/dist` |
| `LOG_LEVEL` | No | `trace` … `fatal`, or `silent` (default `info`; silent in tests) | `info` |
| `LOG_PRETTY` | No | `true` prints readable lines instead of JSON (`npm run dev` sets it) | `true` |
| `SHOW_INSTANCE` | No | `true` adds an `X-Instance` header (the hostname) to every response and an `instance` field to `/health`, to see which instance answered. Set by docker compose for the scaling demo; not set in production | `true` |
| `GIT_COMMIT` | No | Shown in `/health` and logs when not on Render (Render sets `RENDER_GIT_COMMIT`) | `9047a27` |

#### Dev login (`DEV_LOGIN=true`)

For testing pages as different users on your own computer. Put `DEV_LOGIN=true` in `backend/.env`, start the backend and `web/` with `npm run dev`, and open `http://localhost:5173/app/login`: a box "Dev login" lists the active admins and managers.

Safeguards (`src/utils/devLogin.ts`, `src/trpc/routers/dev.ts`):
- Off unless `DEV_LOGIN` is exactly `true`; the `dev.*` API then answers `NOT_FOUND`.
- The server **refuses to start** with `NODE_ENV=production` and `DEV_LOGIN=true` (same as `SKIP_TOTP`).
- It also refuses to start with `DEV_LOGIN=true` and any database other than `DB_PROVIDER=local`, so a local server pointed at the production database (Neon) can't offer it either.
- Only the Vite dev server asks for the list; the production build of the web app never does.
- Each dev login is logged as a warning and written to the audit log (`login`, metadata `devLogin: true`).

### Database

| Variable | Required | Description | Example |
|---|---|---|---|
| `DB_PROVIDER` | Yes | `local` for Docker, `neon` for Neon | `local` |
| `LOCAL_DATABASE_URL` | If local | Local Postgres connection string | `postgresql://app:app@localhost:5433/appdb` |
| `NEON_DATABASE_URL` | If neon | Neon serverless connection string | `postgresql://...` |

### Email

| Variable | Required | Description | Example |
|---|---|---|---|
| `MAIL_PROVIDER` | No | `local` (Mailpit) or `mailgun` (default). The app refuses to start without `MAILGUN_API_KEY` and `MAILGUN_DOMAIN` unless it is `local` | `local` |
| `MAIL_HOST` | No | SMTP host for `local` (default `localhost`; `mailpit` inside docker compose) | `localhost` |
| `MAIL_FROM` | Yes | Sender address | `noreply@example.com` |
| `MAILGUN_API_KEY` | If mailgun | Mailgun domain sending key | `...` |
| `MAILGUN_DOMAIN` | If mailgun | Mailgun sending domain | `mg.example.com` |
| `MAILGUN_HOST` | If mailgun (EU) | Mailgun API host — set for EU domains | `api.eu.mailgun.net` |

**Local development:** set `MAIL_PROVIDER=local` — Mailpit is included in `docker-compose.yml` and requires no credentials. All outgoing emails are intercepted and visible at `http://localhost:8025` regardless of the recipient address.

**Production:** uses the Mailgun HTTP API (not SMTP) via `nodemailer-mailgun-transport`, with the sending domain `mg.hunt-hub.de` (EU region, `MAILGUN_HOST=api.eu.mailgun.net`). The sender `noreply@hunt-hub.de` passes SPF, DKIM and DMARC through the subdomain (relaxed alignment).

### File Storage

| Variable | Required | Description | Example |
|---|---|---|---|
| `STORAGE_PROVIDER` | Yes | `minio` or `r2` | `minio` |
| `MINIO_ENDPOINT` | If minio | S3 endpoint of the local storage (RustFS in docker compose; the `MINIO_*` names are kept because the API is the same) | `http://localhost:9000` |
| `MINIO_ACCESS_KEY` | If minio | MinIO access key | `minioadmin` |
| `MINIO_SECRET_KEY` | If minio | MinIO secret key | `minioadmin` |
| `MINIO_BUCKET` | If minio | Bucket name | `hunt-hub` |
| `MINIO_REGION` | No | MinIO region (default: `eu-west-1`) | `eu-west-1` |
| `R2_ACCOUNT_ID` | If r2 | Cloudflare account ID | `abc123` |
| `R2_ACCESS_KEY` | If r2 | R2 access key | `...` |
| `R2_SECRET_KEY` | If r2 | R2 secret key | `...` |
| `R2_BUCKET` | If r2 | R2 bucket name | `hunt-hub` |

### Database Seeding

| Variable | Required | Description | Example |
|---|---|---|---|
| `ADMIN_FIRST_NAME` | Yes | Admin account first name | `Admin` |
| `ADMIN_LAST_NAME` | Yes | Admin account last name | `User` |
| `ADMIN_EMAIL` | Yes | Admin login email | `admin@example.com` |
| `ADMIN_PASSWORD` | Yes | Admin login password | `changeme` |
| `SEED_MOCK_DATA` | No | Seed fake estates/events/guests | `true` |

---

## Scripts

### Development

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload (tsx + nodemon) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |

### Database

| Script | Description |
|---|---|
| `npm run db:migrate` | Enable PostGIS/pg_trgm, run pending migrations, create indexes — safe for production |
| `npm run db:migrate:neon` | Same as above against Neon |
| `npm run db:gen` | Generate a new migration file from schema changes |
| `npm run db:seed` | Insert admin account and optional mock data (prompts for confirmation) |
| `npm run db:seed:neon` | Seed admin account on Neon (mock data disabled) |
| `npm run db:reset` | **Destructive.** Drop all tables → migrate → seed. Dev only, prompts for confirmation |
| `npm run db:reset:neon` | **Don't use for now:** the table list in `reset.ts` is outdated since migration 0011 and would leave the database half deleted (HUN-53) |
| `npm run db:docker-reset` | Wipe Docker volumes, restart containers, migrate, and seed |
| `npm run db:reset:test` | Wipe and re-migrate the test database (port 5434) |
| `npm run db:push` | Apply schema directly via drizzle-kit (bypasses migration files — dev only) |
| `npm run db:push:neon` | Same against Neon. **Don't use for production changes:** production is changed only through migrations |
| `npm run loadtest` | Load test with 1 to 4 instances behind the load balancer: creates the test data, then measures (see "Do more instances mean more performance?"; needs Docker) |
| `npm run db:analyze` | `EXPLAIN ANALYZE` of the main queries against the local database (`scripts/analyze-queries.ts`) |
| `npm run studio` | Open Drizzle Studio (database GUI) |

### Testing

| Script | Description |
|---|---|
| `npm run test:unit` | Run unit tests |
| `npm run test:integration` | Run integration tests against test database |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run test:workers` | Run the worker-thread tests (geo file parsing) |
| `npm run test:all` | Run all tests |
| `npm run test:coverage` | Run all tests with v8 coverage report |

---

## Load test and caching

`scripts/load-test.ts` measures the area page's API call, `manager.areas.get` (area + boundary as GeoJSON + stands), with [autocannon](https://github.com/mcollina/autocannon).

```bash
npx tsx scripts/load-test.ts setup                                   # local DB: test estate, manager, area with a 10,000-point boundary, 300 stands
npm run build
LOAD_TEST=true LOG_LEVEL=warn PORT=3002 node dist/src/index.js         # built server, rate limiting off (see below)
npx tsx scripts/load-test.ts run                                     # 20 connections, 20 s (DURATION, CONNECTIONS, VERTICES, STANDS)
```

`LOAD_TEST=true` turns rate limiting off, so the test measures the server and not the limiter. Like `DEV_LOGIN`, the server refuses to start with it in production or with any database other than `DB_PROVIDER=local` (`src/utils/devLogin.ts`).

**Where the time went** (before the cache): the database converts the boundary in ~2.5 ms (warm), but every request then moves ~232 KB of GeoJSON from Postgres to Node (~4 ms round trip), parses it (~1.4 ms) and serialises the response (~1.4 ms). With 20 parallel requests one Node CPU core was the limit.

**The cache** (`boundaryCache` in `src/services/areas.ts`, `src/utils/lruCache.ts`): the boundary GeoJSON is kept in memory per instance, keyed by area id **and `updated_at`**. A cheap query (no geometry) reads the version on every request, and a database trigger bumps `updated_at` on every change, so a cached boundary is never stale, also with several instances and without shared invalidation. Limited to 100 areas / ~50 MB (least recently used are dropped). Integration tests check that a changed or removed boundary is returned right away.

**Result** (MacBook M1, Node 22, local Postgres, 20 connections, 20 s, response ~261 KB):

| | Before | With cache | Change |
|---|---|---|---|
| Requests/s | 88 | 171 | +94 % |
| Latency p50 | 184 ms | 109 ms | −41 % |
| Latency p97.5 | 673 ms | 179 ms | −73 % |
| Latency p99 | 1,472 ms | 208 ms | −86 % |
| Errors / non-2xx | 0 | 0 | |

Single runs on a laptop: the numbers show the order of magnitude, not exact capacity on Render.

**Next steps, not done yet:** HTTP caching (`ETag` + `304 Not Modified`) so unchanged boundaries aren't sent again at all; a simplified boundary for small zoom levels (`ST_SimplifyPreserveTopology`); gzip/brotli for the large JSON responses. Scaling out works: sessions and rate-limit counters are in Postgres, and the cache needs no coordination between instances (shown in the "Horizontal scaling demo").

## Horizontal scaling demo

Shows that several instances behind a load balancer behave like one, because no instance keeps state of its own (`scripts/scale-demo.ts`, local database only):

```bash
docker compose up -d && npm run db:migrate
npx tsx scripts/load-test.ts setup                          # test manager, once
APP_INSTANCES=3 docker compose --profile app up -d --build  # three instances behind nginx on :3001
APP_INSTANCES=3 npx tsx scripts/scale-demo.ts
```

| Check | What it proves |
|---|---|
| 1. Round robin | 20 requests are answered by every instance in turn (`X-Instance` header) |
| 2. Shared session | One login works on every instance: the session is in Postgres, not in the instance's memory |
| 3. Shared rate limit | 20 wrong logins are allowed **in total**, the 21st gets 429, although the attempts were spread over the instances. With counters in memory, each instance would have allowed 20 |

Result with three instances (18 Nov 2026):

```
1. Round robin         PASS  20 requests answered by 3 instances
2. Shared session      PASS  10/10 requests with one login cookie succeeded, on 3 instances
3. Shared rate limit   PASS  20 wrong logins allowed, attempt 21 → 429 (attempts per instance: 8, 7, 6)
```

The demo clears its own login counters (`rate_limits` keys `auth:…`) before and after, so it can be repeated and doesn't block real logins. Production runs one instance; more would need a paid Render plan, and the load balancer would then be Render's own.

### Do more instances mean more performance?

> **Local test only.** These numbers come from one laptop (MacBook, Docker Desktop), not from the server. Production on Render runs one instance on different hardware, with the network between the app and the database (Neon) in between, so the absolute numbers there will be different. What carries over is the trend: more instances help while there is free CPU, and stop helping when the instances compete for the same cores or wait for the shared database.

`scripts/scale-benchmark.ts` measures the most expensive request (`manager.areas.get`: area with a 10,000-point boundary and 300 stands, ~260 KB) through the load balancer with 1 to n instances. It starts each setting with `LOAD_TEST=true APP_INSTANCES=<n>`, warms up every instance's cache, and reports the median of three 20 s runs (20 connections, autocannon):

```bash
npm run loadtest                              # test data + 1 to 4 instances, about 6 minutes
INSTANCES=1,2,3,4,6 npm run loadtest          # other numbers of instances (also RUNS, DURATION)
```

Results (18 Nov 2026, MacBook, Docker Desktop; no errors in any run):

| Instances | Docker with 2 CPUs: req/s | vs 1 | p99 | Docker with 6 CPUs: req/s | vs 1 | p99 |
|---|---|---|---|---|---|---|
| 1 | 110 | 100 % | 414 ms | 128 | 100 % | 388 ms |
| 2 | **145** | **131 %** | 325 ms | 187 | 146 % | 275 ms |
| 3 | 126 | 114 % | 722 ms | **210** | **165 %** | 224 ms |
| 4 | 95 | 86 % | 805 ms | 195 | 153 % | 268 ms |
| 6 | – | | | 160 | 125 % | 322 ms |

The command-line output of both series (rendered from the raw output in [docs/benchmarks/2026-11-18/](../docs/benchmarks/2026-11-18/)):

![Series 1: Docker with 2 CPUs](../docs/benchmarks/2026-11-18/series-1-docker-2cpu.png)
![Series 2: Docker with 6 CPUs](../docs/benchmarks/2026-11-18/series-2-docker-6cpu.png)

**What it shows:**
- **Horizontal scaling works while there is free CPU.** One Node process uses about one core for this request (parsing and serialising the large JSON), so a second instance on a second core adds a lot.
- **More instances than the hardware can carry make it worse.** With 2 CPUs the best is 2 instances; with 6 CPUs it is 3. Beyond that, the instances, nginx and PostgreSQL compete for the same cores: throughput drops and the slowest requests (p99) get slower.
- **Vertical scaling alone helps little:** one instance on 6 instead of 2 CPUs is only 16 % faster (110 → 128 req/s), because a single Node process mostly uses one core. More cores pay off only with more instances.
- **Why not 6 × faster with 6 instances:** all instances share one database, one load balancer and one machine, and part of each request is the database query and moving ~260 KB through nginx.

**Limits:** the load generator, nginx, PostgreSQL and the instances all run on one laptop, Docker on macOS runs in a virtual machine, and the numbers are single series; other programs running on the laptop change them noticeably. Compare the ratio between settings, not the absolute numbers. They show the trend, not the capacity of the production server. On a real host the instances would also get their own CPUs, and the database would be the next bottleneck (then: connection pooling, read replicas, or the HTTP caching listed under "Next steps").

---

## Database and schema

### Dual-database support

The app supports two drivers, switched via `DB_PROVIDER`:

| Mode | Driver | Variable | Use for |
|---|---|---|---|
| `local` | `pg` | `LOCAL_DATABASE_URL` | Local development |
| `neon` | `pg` (SSL) | `NEON_DATABASE_URL` | Production / staging |

### Schema overview

The core of the data model (sessions, rate limits, sync, audit and token tables are left out of the diagram; all tables are in the list below):

```mermaid
erDiagram
  ESTATES ||--o{ USERS : "managers, staff, guests"
  USERS ||--o| ACCOUNTS : "login (admins, managers, staff)"
  USERS ||--o| CONTACTS : "guest details"
  ESTATES ||--o{ AREAS : has
  AREAS ||--o{ STANDS : contains
  ESTATES ||--o{ EVENTS : plans
  EVENTS ||--o{ DRIVES : "split into"
  EVENTS ||--o{ INVITATIONS : has
  USERS ||--o{ INVITATIONS : "guest receives"
  ESTATES ||--o{ GUEST_GROUPS : has
  GUEST_GROUPS ||--o{ GUEST_GROUP_MEMBERS : contains
  USERS ||--o{ GUEST_GROUP_MEMBERS : "belongs to"
  USERS ||--o{ HUNTING_LICENSES : "guest uploads"
  HUNTING_LICENSES ||--o{ HUNTING_LICENSE_ATTACHMENTS : files
  USERS ||--o{ TRAINING_CERTIFICATES : "guest uploads"
  TRAINING_CERTIFICATES ||--o{ TRAINING_CERTIFICATE_ATTACHMENTS : files
  USERS ||--o{ DOCUMENT_REJECTIONS : "guest gets"
  DRIVES ||--o{ DRIVE_STAND_ASSIGNMENTS : uses
  STANDS ||--o{ DRIVE_STAND_ASSIGNMENTS : "assigned in"

  USERS {
    int id PK
    enum role "admin, manager, staff, guest"
    int estate_id FK "null only for admins"
  }
  AREAS {
    int id PK
    int estate_id FK
    geometry geofile "PostGIS MultiPolygon, WGS 84"
  }
  STANDS {
    int id PK
    int area_id FK
    geometry location "PostGIS Point, WGS 84"
    enum status "ok, needs_repair, broken, removed"
  }
  INVITATIONS {
    int id PK
    uuid public_id "the magic link"
    int event_id FK
    int user_id FK
    enum status "staged, sent_email, sent_manually, waitlist, archived"
    enum response "open, yes, no"
  }
```

Guests are `users` with the role `guest` and no account: they reach their answer page through the invitation's `public_id`. Deleting an estate, area or event removes what belongs to it (`ON DELETE CASCADE`).

**All tables and relations** (with the login, sync and template tables) are in [docs/DATABASE.md](../docs/DATABASE.md).

The schema is defined in `src/db/schema/` using Drizzle. Key tables:

| Table | Description |
|---|---|
| `estates` | Hunting estates — top-level tenant |
| `users` | Staff accounts (admin / manager / staff) |
| `accounts` | Login credentials (email + bcrypt password), active flag, failed-attempt counter + lockout timestamp |
| `contacts` | Extended guest info: email, phone, date of birth, rating |
| `events` | Hunting events (name, date, time) scoped to an estate |
| `drives` | Individual drives within an event (start/end time) |
| `drive_groups` | Groups of guests assigned to a drive |
| `drive_stand_assignments` | Stands used within a drive |
| `areas` | Geographic areas of the estate (PostGIS geometry) |
| `stands` | Individual hunting positions within an area (point, number, nickname, status with date) |
| `templates`, `template_groups`, `template_stand_assignments` | Drive templates (schema only, not used by the app yet; see HUN-91) |
| `invitations` | Guest invitations — status, RSVP response, magic link token |
| `guest_groups` | Reusable named groups of guests |
| `guest_group_members` | Members of a guest group |
| `hunting_licenses` | Guest hunting licence records + checked/expiry |
| `hunting_license_attachments` | Files attached to a licence (photo or document) |
| `training_certificates` | Guest training certificate records + checked/issue date |
| `training_certificate_attachments` | Files attached to a certificate |
| `document_rejections` | Rejected licences and certificates with the reason shown to the guest |
| `user_auth_tokens` | Activation and password reset tokens (with expiry) |
| `totp_backup_codes` | One-time backup codes for admin 2FA recovery (tracked as used/unused) |
| `audit_logs` | Immutable event log (login, logout, invitations, etc.) |
| `mobile_sessions` | iPhone app logins (hashed access and refresh tokens, expiry, revocation) |
| `sync_mutations` | Offline changes received from the app (applied exactly once) |
| `sync_tombstones` | Deleted areas and stands, so the app can remove them (written by triggers) |
| `rate_limits` | Rate-limit counters shared by all instances |
| `session` | Login sessions (created by connect-pg-simple) |

The schema changes only through the numbered SQL migrations in `drizzle/` (0000 to 0014), which CI tests and the deployment applies. PostGIS is required for geospatial area data. The Docker Compose file uses the `postgis/postgis:16-3.4` image.

---

## Tests

Tests use **Vitest** (with Supertest for HTTP) in four suites, all in `src/tests/`:

| Suite | Folder | What it covers | Needs |
|---|---|---|---|
| Unit | `unit/` | controllers, middlewares, services, tRPC procedures, utils (database mocked) | nothing |
| Integration | `integration/` | routes and tRPC against a real PostGIS test database | `db_test` (port 5434) |
| E2E | `e2e/` | full flows through the app (onboarding, TOTP, invitations, RSVP) | `db_test` |
| Workers | `workers/` | geo file parsing in the worker thread (fixtures in `fixtures/`) | nothing |

```bash
docker compose up -d db_test   # test database; migrations run automatically before the suites
npm run test:all
```

The tests don't depend on a local `.env` (CI has none). CI (`.github/workflows/ci.yml`) also runs the web and mobile tests and builds and smoke-tests the Docker image.

---

## Project Structure

```
src/
├── index.ts                 # Startup checks (env), listen, graceful shutdown
├── app.ts                   # Middleware stack + route mounting
├── db/                      # Drizzle client, schema (one file per table), migrate, seed, reset
├── routes/                  # Express routers (auth, manager, admin, rsvp, health, …); old page URLs redirect to /app
├── controllers/             # Server-rendered pages and form handlers (manager/, admin/, users/, licenses, files, map)
├── services/                # Business logic shared by pages and APIs (estate-scoped, typed errors)
│   ├── areas.ts, stands.ts  #   areas with boundary upload and cache; stands (number, nickname, status)
│   ├── events.ts            #   events and drives
│   ├── invitations.ts       #   guest lists, sending and reminders
│   ├── rsvp.ts              #   the guest's answer page
│   ├── guestDocuments.ts    #   licences and certificates: check, reject, upload for the guest
│   ├── dashboard.ts         #   next hunt and to-dos for the manager's start page
│   ├── credentials.ts       #   email/password check with lockout (web and mobile login)
│   ├── userAccess.ts        #   current role/estate/active flag from the database
│   ├── mobileSessions.ts    #   iPhone app tokens (issue, rotate, revoke)
│   ├── storage.ts, mail.ts, audit.ts, hibp.ts
├── trpc/
│   ├── trpc.ts              # Procedures: public, protected, admin, manager (estate-scoped), field (mobile)
│   ├── router.ts            # auth, admin, manager, mobile, rsvp, dev (local only)
│   └── routers/             # One file per area (e.g. manager/areas.ts, manager/events.ts, manager/documents.ts)
├── sync/                    # Mobile sync: pull (changes since cursor) and push (offline changes)
├── shared/                  # Rules shared with the React app: managerNav, invitationStates, driveTimes, standStatus
├── qgis/                    # QGIS / QField (WFS-T at /wfs): router, controller, token check, README
├── middlewares/             # errorHandler, csrf, requireRole, rateLimiter + postgresRateLimitStore, serveWebApp (/app), trpcAuthLimits, trpcMultipart
├── utils/                   # logger (pino), logError, gracefulShutdown, lruCache, crs, devLogin, redirectByRole, runWorker, geofile-parsers, url
├── workers/                 # geofile.worker.ts: parses GeoJSON/KML/GPX/SHP/GPKG off the event loop
├── schemas/                 # Shared Zod schemas
├── mail-views/              # EJS email templates
└── tests/

views/                       # EJS page templates (manager/, admin/, totp/)
drizzle/                     # Migration SQL files (generated by drizzle-kit)
public/                      # Static assets of the server-rendered pages
scripts/load-test.ts         # Load test (see "Load test and caching")
scripts/scale-demo.ts        # Horizontal scaling demo
scripts/scale-benchmark.ts   # Throughput with 1 to n instances
loadbalancer/nginx.conf      # Local load balancer for the scaling demo (docker compose --profile app)
```

---

## Logging and monitoring

- **Request logs** (`src/utils/logger.ts`, pino): one JSON line per request with request id, user id and role, method, path, status code and duration. Cookies, authorization headers, passwords and tokens are removed. `LOG_PRETTY=true` prints readable lines locally.
- **Request id:** every response has an `X-Request-Id` header (an incoming one from a proxy is reused if it looks safe). API errors contain the same id, so an error a user reports can be found in the logs.
- **Errors** are logged once by the central error handler with the request id; unexpected errors return a generic message, never a stack trace.
- **Health:** `GET /health` checks the database and shows the deployed commit; Docker, Render and CI use it.
- **Where to look:** the logs are in Render's log view (searchable by request id); security-relevant actions are also in the audit log (React admin area).

---

## Security

- **Authentication:** server-side sessions in Postgres with `httpOnly`, `SameSite=lax` cookies (`secure` in production); bcrypt passwords checked against Have I Been Pwned; account lockout after repeated failed logins; activation by one-time email token; TOTP two-factor login with backup codes for admins. The iPhone app uses random tokens stored only as SHA-256 hashes (access token 1 hour, refresh token 60 days).
- **Authorisation:** roles (admin, manager, staff, guest). Every manager request re-checks the role and the active flag in the database, and every query is limited to the manager's estate. QGIS uses a personal token per manager, accepted only for active managers and limited to their estate.
- **Web security:** Helmet (CSP, HSTS and other headers), CSRF tokens on forms, request bodies limited to 10 KB, upload size and type limits, a general rate limit on all requests plus stricter ones on login, backup codes, activation and the guest answer page and uploads (counters in Postgres), audit log.
- **Safe defaults:** development switches (`SKIP_TOTP`, `DEV_LOGIN`, `LOAD_TEST`) make the server refuse to start in production; secrets live only in Render's environment variables and a protected GitHub environment.

---

## Development workflow

One Linear issue per change → one branch → small commits → pull request → CI must be green → merge to `main` → automatic deployment. ESLint and the TypeScript compiler run in CI; see the root [README](../README.md#code-quality).

---

## Routes Reference

A full list of all routes, grouped by feature area and access level, is in [docs/USECASES.md](../docs/USECASES.md).

---

## Roles & Access

| Role | How created | Access |
|---|---|---|
| `admin` | Seeded via `npm run db:seed` or created by another admin | React admin area: estates, managers, admins, audit log. Two-factor login required |
| `manager` | Created by an admin (React admin area) | Their own estate only: dashboard, areas, events, invitations and the document check (React); estate, guests, guest groups and staff (server-rendered); iPhone app; QGIS |
| `staff` | Created by a manager under `/manager/people` | iPhone app only (no web area) |
| Guest | Added to the guest list by a manager | No account: RSVP page via the magic link in the invitation email |

Every manager request re-checks the role and active flag in the database, so a demoted or deactivated user loses access immediately.

---

## Production Deployment

Production runs as the Docker image on Render (service `hunt-hub-docker`), with Neon (database), Cloudflare R2 (files) and Mailgun (email). Deployment is automatic; see the root [README](../README.md#build-and-deploy):

1. Every pull request runs CI: type checks, all test suites, Docker image build + `/health` + graceful shutdown.
2. A merge to `main` publishes the tested image to `ghcr.io/carl-castell/hunt-hub` and **runs the migrations against Neon with that image** (GitHub environment `production`, secret `NEON_DATABASE_URL`).
3. Render deploys only after all checks passed and switches to the new version once `GET /health` returns 200.

Production configuration lives in Render's environment variables (`NODE_ENV=production` is set by the image; it enables secure cookies, which need HTTPS; `trust proxy` is configured in `app.ts`).
