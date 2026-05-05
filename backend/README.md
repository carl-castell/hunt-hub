# Hunt Hub — Backend

> **Monorepo note:** This is the `backend/` workspace in the [hunt-hub](https://github.com/carl-castell/hunt-hub) monorepo. The repo was recently restructured from a standalone backend (`hunt-hub_backend`) into a monorepo with `web/` (React) and `mobile/` workspaces. Only `backend/` is production-ready — the other workspaces are early-stage.

Hunting estate management platform. Managers organise events, build guest lists, assign hunting groups to drives and stands, send email invitations with magic-link RSVPs, and track guest documents (hunting licences and training certificates). A separate admin surface manages estates and staff accounts.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20.19+ with TypeScript |
| Framework | Express.js |
| Database | PostgreSQL 16 + PostGIS (Docker locally, Neon in production) |
| ORM | Drizzle ORM |
| Templating | EJS with express-ejs-layouts |
| Auth | Session-based (express-session + connect-pg-simple) |
| Storage | AWS S3-compatible — MinIO locally, Cloudflare R2 in production |
| Email | Nodemailer — Mailgun HTTP API in production, Mailpit locally |
| API layer | tRPC v11 (mounted on Express at `/api/v1/trpc`) |
| Validation | Zod |
| Security | Helmet (CSP, HSTS, etc.), bcrypt, CSRF tokens, express-rate-limit, HIBP Pwned Passwords, per-account lockout, audit logging, session invalidation |
| 2FA | TOTP via otpauth + qrcode (admin accounts) |
| GIS | OGC WFS-T 1.1.0 — QGIS and QField compatible |
| Testing | Vitest + Supertest |

---

## User Surfaces

| Surface | URL prefix | Who uses it |
|---|---|---|
| Public RSVP | `/rsvp/:publicId` | Guests (no login required) |
| Manager dashboard | `/manager` | Managers and staff |
| Admin dashboard | `/admin` | Admins (EJS) |
| tRPC API | `/api/v1/trpc` | React web client (admin, future manager) |
| RSVP Preview | `/rsvp/preview/:eventId` | Managers (testing the RSVP flow) |
| WFS endpoint | `/wfs` | QGIS / QField (token-authenticated, OGC WFS-T 1.1.0) |

---

## Prerequisites

- Node.js 20.19+
- Docker and Docker Compose (for local Postgres and MinIO)
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

# 4. Start Docker services (Postgres + MinIO)
docker compose up -d

# 5. Enable extensions, run migrations, and create indexes
npm run db:migrate

# 6. Seed the database (creates admin account + optional mock data)
npm run db:seed

# 7. Start the development server
npm run dev
# → http://localhost:3000
```

---

## Environment Variables

### Application

| Variable | Required | Description | Example |
|---|---|---|---|
| `NODE_ENV` | Yes | Runtime environment | `development` |
| `PORT` | No | HTTP port (default: 3000) | `3000` |
| `SESSION_SECRET` | Yes | Random string for session signing | `change-me-32-chars-min` |
| `DOMAIN` | Yes | Base URL used in email links and RSVP URLs | `http://localhost:3000` |
| `SKIP_TOTP` | No | Skip admin TOTP — dev/test only, **throws at startup if set in production** | `true` |

### Database

| Variable | Required | Description | Example |
|---|---|---|---|
| `DB_PROVIDER` | Yes | `local` for Docker, `neon` for Neon | `local` |
| `LOCAL_DATABASE_URL` | If local | Local Postgres connection string | `postgresql://app:app@localhost:5433/appdb` |
| `NEON_DATABASE_URL` | If neon | Neon serverless connection string | `postgresql://...` |

### Email

| Variable | Required | Description | Example |
|---|---|---|---|
| `MAIL_PROVIDER` | Yes | `local` (Mailpit) or `mailgun` | `local` |
| `MAIL_FROM` | Yes | Sender address | `noreply@example.com` |
| `MAILGUN_API_KEY` | If mailgun | Mailgun Private API key | `key-...` |
| `MAILGUN_DOMAIN` | If mailgun | Mailgun sending domain | `mg.example.com` |
| `MAILGUN_HOST` | If mailgun (EU) | Mailgun API host — set for EU domains | `api.eu.mailgun.net` |

**Local development:** set `MAIL_PROVIDER=local` — Mailpit is included in `docker-compose.yml` and requires no credentials. All outgoing emails are intercepted and visible at `http://localhost:8025` regardless of the recipient address.

**Production:** uses the Mailgun HTTP API (not SMTP) via `nodemailer-mailgun-transport`. If your Mailgun domain is EU-hosted, set `MAILGUN_HOST=api.eu.mailgun.net`.

### File Storage

| Variable | Required | Description | Example |
|---|---|---|---|
| `STORAGE_PROVIDER` | Yes | `minio` or `r2` | `minio` |
| `MINIO_ENDPOINT` | If minio | MinIO server URL | `http://localhost:9000` |
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
| `npm run db:reset:neon` | Same as above against Neon |
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
| `npm run test:all` | Run all tests |
| `npm run test:coverage` | Run all tests with v8 coverage report |

---

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

PostGIS is required for geospatial area data. The Docker Compose file uses the `postgis/postgis:16-3.4` image.

---

## Testing

Tests use **Vitest** and are split into three suites. Integration tests run against a separate test database on port **5434** (defined in `docker-compose.yml` as the `db_test` service). A global setup file runs Drizzle migrations before any tests execute, so the schema is always in sync. E2E tests spin up the full server against the same test database.

```bash
# Ensure the test database container is running
docker compose up -d db_test

# Run integration tests
npm run test:integration
```

Test files live in `src/tests/`:

```
src/tests/
├── global-setup.integration.ts   # Runs migrations before integration suite
├── setup.integration.ts          # Per-test DB cleanup and seeding
├── unit/
│   ├── schemas.test.ts
│   └── middleware.test.ts
├── integration/
│   ├── auth.test.ts
│   ├── activate.test.ts
│   ├── users.test.ts
│   └── manager/
│       ├── estates.test.ts
│       ├── people.test.ts
│       ├── guests.test.ts
│       ├── events.test.ts
│       ├── areas.test.ts
│       └── licenses.test.ts
└── e2e/
    ├── login.test.ts
    ├── admin-totp.test.ts
    └── manager-dashboard.test.ts
```

---

## Project Structure

```
src/
├── index.ts                    # Entry point — binds Express app to port
├── app.ts                      # Middleware stack + route mounting
│
├── db/
│   ├── index.ts                # Database client (pg or neon)
│   ├── migrate.ts              # Enable extensions + run migrations + create indexes (safe for prod)
│   ├── reset.ts                # Drop all tables → migrate → seed (dev only)
│   ├── seed.ts                 # Insert admin account and optional mock data
│   ├── seed.mock.ts            # Fake estates/events/guests for local development
│   └── schema/                 # Drizzle table definitions (one file per table)
│
├── middlewares/
│   ├── csrf.ts                 # CSRF token generation and verification
│   ├── requireRole.ts          # Auth guards (requireAdmin, requireManager, requireAuth)
│   ├── rateLimiter.ts          # General + auth-specific rate limits
│   └── logger.ts               # Request logger
│
├── routes/
│   ├── home.ts
│   ├── auth.ts                 # Login / logout
│   ├── activate.ts             # Account activation via token
│   ├── totp.ts                 # TOTP 2FA setup and verification
│   ├── rsvp.ts                 # Public RSVP flow (no auth)
│   ├── admin.ts
│   ├── manager.ts
│   ├── users.ts
│   └── map.ts
│
├── controllers/
│   ├── admin/
│   │   ├── dashboard.ts
│   │   └── estates.ts
│   ├── manager/
│   │   ├── dashboard.ts
│   │   ├── estate.ts
│   │   ├── events.ts
│   │   ├── invitations.ts      # Staging, sending, RSVP list
│   │   ├── drives.ts
│   │   ├── guests.ts
│   │   ├── guest_groups.ts
│   │   ├── people.ts           # Staff user management
│   │   ├── areas.ts            # GIS area management
│   │   └── account.ts
│   ├── rsvp.ts                 # Public RSVP + document upload
│   ├── rsvp-preview.ts         # Manager RSVP preview flow
│   ├── licenses.ts             # Hunting licence + certificate management
│   ├── files.ts                # Serve uploaded files (estate-scoped)
│   ├── wfs.ts                  # OGC WFS-T 1.1.0 — GetCapabilities / GetFeature / Transaction
│   └── users/
│       ├── activate.ts
│       ├── create.ts
│       └── users.ts
│
├── trpc/
│   ├── context.ts              # Builds tRPC context from Express req/res (session + user)
│   ├── trpc.ts                 # Base procedures: publicProcedure, protectedProcedure, adminProcedure
│   ├── router.ts               # Root router — combines all sub-routers
│   └── routers/
│       ├── auth.ts             # login, logout, me, totp setup/verify/backup
│       └── admin/
│           ├── index.ts        # Admin router (requires role=admin)
│           ├── account.ts      # Admin account info + change password
│           ├── estates.ts      # Estate CRUD + add manager
│           ├── managers.ts     # Manager deactivate / activation link / delete
│           ├── audit.ts        # Audit log queries (paginated)
│           └── settings.ts     # List admins + create admin
│
├── services/
│   ├── storage.ts              # S3-compatible upload/delete (MinIO or R2)
│   ├── mail.ts                 # Nodemailer transport + template rendering
│   ├── audit.ts                # Audit log helper
│   └── hibp.ts                 # HaveIBeenPwned k-anonymity password check
│
├── workers/
│   └── geofile.worker.ts       # Worker thread: parses GeoJSON/KML/GPX/SHP/GPKG off the event loop
│
├── utils/
│   ├── runWorker.ts            # Promise wrapper for worker_threads
│   ├── url.ts                  # getBaseUrl() — DOMAIN in production, request host in dev
│   └── logError.ts             # Safe error logger — never leaks raw error objects to console
│
├── schemas/                    # Shared Zod schemas
├── mail-views/                 # EJS email templates
└── tests/

views/                          # EJS page templates
├── layout.ejs                  # Root layout
├── admin/
├── manager/
└── rsvp/                       # Public RSVP pages (own layout, no sidebar)

drizzle/                        # Migration SQL files (generated by drizzle-kit)
public/                         # Static assets
```

---

## Routes Reference

A full list of all routes, grouped by feature area and access level, is in [USECASES.md](./USECASES.md).

---

## Roles & Access

| Role | How created | Access |
|---|---|---|
| `admin` | Seeded via `npm run db:seed` or created by another admin | Full access — create/delete estates, manage any user |
| `manager` | Created by admin via `/admin` dashboard | Estate-scoped — full control over their estate's events, guests, documents, and staff |
| `staff` | Created by manager via `/manager/people` | Estate-scoped — limited operational access |
| Guest | Added to guest list by manager | No account — accesses RSVP page via magic link in invitation email |

---

## Production Deployment

1. Set `DB_PROVIDER=neon` and provide `NEON_DATABASE_URL`.
2. Set `STORAGE_PROVIDER=r2` and provide R2 credentials.
3. Configure Mailgun HTTP API credentials (`MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, and `MAILGUN_HOST` for EU domains).
4. Set `NODE_ENV=production` — this enables secure cookies (requires HTTPS) and activates rate limiting.
5. Run `npm run db:migrate:neon` to enable extensions, run all migrations, and create indexes on the production database.
6. Build and start: `npm run build && npm start`.

> Secure cookies require the app to be served over HTTPS. Set `trust proxy` accordingly if deployed behind a reverse proxy (already configured in `app.ts`).
