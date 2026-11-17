# Hunt Hub — Backend

> This is the `backend/` workspace of the [hunt-hub](https://github.com/carl-castell/hunt-hub) monorepo (with `web/`, the React app, and `mobile/`, the iPhone app). The backend serves the server-rendered pages, the APIs, and the built React app under `/app`. Use cases and all routes: [docs/USECASES.md](../docs/USECASES.md).

Hunting estate management platform. Managers organise events, build guest lists, assign hunting groups to drives and stands, send email invitations with magic-link RSVPs, and track guest documents (hunting licences and training certificates). A separate admin surface manages estates and staff accounts.

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
| Security | Helmet (CSP, HSTS, etc.), bcrypt, CSRF tokens, express-rate-limit, HIBP Pwned Passwords, per-account lockout, audit logging, session invalidation |
| 2FA | TOTP via otpauth + qrcode (admin accounts) |
| GIS | OGC WFS-T 1.1.0 — QGIS and QField compatible |
| Logging | pino: one JSON line per request (request id, user, status, duration); secrets and personal data redacted |
| Deployment | Docker image (multi-stage, non-root), GitHub Actions CI/CD, Render (Docker runtime), Neon, Cloudflare R2, Mailgun (EU) |
| Testing | Vitest + Supertest (unit, integration, e2e, workers) |

---

## User Surfaces

| Surface | URL | Who uses it |
|---|---|---|
| Login | `/app/login` (`/` and `/login` redirect there) | Everyone |
| React app: admin area | `/app/admin` | Admins |
| React app: manager pages (Areas so far) | `/app/manager/...` | Managers |
| Server-rendered manager pages | `/manager` | Managers |
| Public RSVP | `/rsvp/:publicId` | Guests (magic link, no login) |
| RSVP preview | `/rsvp/preview/:eventId` | Managers |
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
docker compose --profile app up -d --build                       # http://localhost:3001
docker compose --profile app run --rm app node dist/src/db/migrate.js   # migrations, if needed
```

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

**Next steps, not done yet:** HTTP caching (`ETag` + `304 Not Modified`) so unchanged boundaries aren't sent again at all; a simplified boundary for small zoom levels (`ST_SimplifyPreserveTopology`); gzip/brotli for the large JSON responses. Scaling out works now: sessions and rate-limit counters are in Postgres, and the cache needs no coordination between instances.

## Database

### Dual-database support

The app supports two drivers, switched via `DB_PROVIDER`:

| Mode | Driver | Variable | Use for |
|---|---|---|---|
| `local` | `pg` | `LOCAL_DATABASE_URL` | Local development |
| `neon` | `pg` (SSL) | `NEON_DATABASE_URL` | Production / staging |

### Schema overview

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
| `stands` | Individual hunting positions within an area |
| `invitations` | Guest invitations — status, RSVP response, magic link token |
| `guest_groups` | Reusable named groups of guests |
| `guest_group_members` | Members of a guest group |
| `hunting_licenses` | Guest hunting licence records + checked/expiry |
| `hunting_license_attachments` | Files attached to a licence (photo or document) |
| `training_certificates` | Guest training certificate records + checked/issue date |
| `training_certificate_attachments` | Files attached to a certificate |
| `user_auth_tokens` | Activation and password reset tokens (with expiry) |
| `totp_backup_codes` | One-time backup codes for admin 2FA recovery (tracked as used/unused) |
| `audit_logs` | Immutable event log (login, logout, invitations, etc.) |
| `mobile_sessions` | iPhone app logins (hashed access and refresh tokens, expiry, revocation) |
| `sync_mutations` | Offline changes received from the app (applied exactly once) |
| `sync_tombstones` | Deleted areas and stands, so the app can remove them (written by triggers) |

PostGIS is required for geospatial area data. The Docker Compose file uses the `postgis/postgis:16-3.4` image.

---

## Testing

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
├── routes/                  # Express routers (auth, manager, admin, rsvp, health, …)
├── controllers/             # Server-rendered pages and form handlers (manager/, admin/, users/, rsvp, licenses, files, map)
├── services/                # Business logic shared by pages and APIs
│   ├── areas.ts             #   areas: list, get, create, rename, delete, boundary upload (estate-scoped, typed errors)
│   ├── credentials.ts       #   email/password check with lockout (web and mobile login)
│   ├── userAccess.ts        #   current role/estate/active flag from the database
│   ├── mobileSessions.ts    #   iPhone app tokens (issue, rotate, revoke)
│   ├── storage.ts, mail.ts, audit.ts, hibp.ts
├── trpc/
│   ├── trpc.ts              # Procedures: public, protected, admin, manager (estate-scoped), field (mobile)
│   ├── router.ts            # auth, admin, manager, mobile
│   └── routers/             # One file per area (e.g. manager/areas.ts)
├── sync/                    # Mobile sync: pull (changes since cursor) and push (offline changes)
├── shared/managerNav.ts     # The manager menu, used by the EJS layout and the React app
├── qgis/                    # QGIS / QField (WFS-T at /wfs): router, controller, token check, README
├── middlewares/             # csrf, requireRole, rateLimiter, serveWebApp (/app), trpcAuthLimits, trpcMultipart
├── utils/                   # logger (pino), logError, gracefulShutdown, redirectByRole, runWorker, geofile-parsers, url
├── workers/                 # geofile.worker.ts: parses GeoJSON/KML/GPX/SHP/GPKG off the event loop
├── schemas/                 # Shared Zod schemas
├── mail-views/              # EJS email templates
└── tests/

views/                       # EJS page templates (manager/, admin/, rsvp/, totp/)
drizzle/                     # Migration SQL files (generated by drizzle-kit)
public/                      # Static assets of the server-rendered pages
```

---

## Routes Reference

A full list of all routes, grouped by feature area and access level, is in [docs/USECASES.md](../docs/USECASES.md).

---

## Roles & Access

| Role | How created | Access |
|---|---|---|
| `admin` | Seeded via `npm run db:seed` or created by another admin | React admin area: estates, managers, admins, audit log. Two-factor login required |
| `manager` | Created by an admin (React admin area) | Their own estate only: areas (React), guests, events, invitations, documents, staff (server-rendered), iPhone app, QGIS |
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
