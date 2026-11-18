# Hunt Hub

[![CI](https://github.com/carl-castell/hunt-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/carl-castell/hunt-hub/actions/workflows/ci.yml)

> **Work in progress.** Hunt Hub is currently under active development.

A platform for managing hunting estates, events, and guests.

## What Hunt Hub does

- **Estate managers** plan hunting events, invite guests by email, check their hunting licences and training certificates, and manage hunting areas and stands, with satellite maps in the web app and full GIS editing in QGIS / QField.
- **Guests** answer invitations through a personal link and upload their documents, without an account.
- **Managers and staff in the field** see their estate's areas and stands on the iPhone app, also without mobile signal.
- **Admins** create estates and their managers.

All use cases, who uses them and where they live (React app, server-rendered pages, iPhone app, QGIS), plus every route and API: **[docs/USECASES.md](docs/USECASES.md)**.

Using Hunt Hub in QGIS, step by step: **[backend/src/qgis/README.md](backend/src/qgis/README.md)**.

Hunt Hub started as a server-rendered web application. New and reworked screens are built in the React app, step by step, next to the existing pages; the iPhone app is an offline-first Expo app.

Production: **https://hunt-hub-docker.onrender.com** (`/health` shows the deployed commit).

## Getting Started

This is an npm workspaces monorepo (`backend/`, `web/`, `mobile/`) with **one lockfile in the repo root**. Use Node.js 22 (see `.node-version`) and always install from the repo root:

```bash
npm install
```

## Code quality

| Tool | What it checks | Run |
|---|---|---|
| **TypeScript** (`strict`) | types across backend, web and mobile; the web and mobile apps also type-check the backend's tRPC types, so an API change that breaks a client fails at once | `npx tsc --noEmit` per workspace (CI) |
| **ESLint** (`eslint.config.mjs`) | `@eslint/js` + `typescript-eslint` recommended rules for backend and web, React hooks rules for web; no warnings allowed | `npm run lint` |
| **Vitest / Jest** | unit, integration (real PostGIS), e2e and worker tests for the backend; web and mobile unit tests | see the workspace READMEs |
| **CI** (`.github/workflows/ci.yml`) | runs all of the above plus the Docker image check on every pull request | automatic |

Rule exceptions are documented where they are made: `any` is allowed in tests (loosely typed mocks), and the one `any` in the source (`backend/src/sync/handlers/index.ts`) has a comment explaining why.

## Build and deploy

The backend serves the server-rendered pages and, under `/app`, the built React app (`web/dist`). Both are packaged into **one Docker image** (`Dockerfile` in the repo root; see `backend/README.md` → "Running the app in Docker").

**Continuous deployment** (`.github/workflows/ci.yml`):

```
pull request ──> type check + build, unit, integration/e2e, Docker image (build, /health, graceful shutdown)
merge to main ──> same checks ──> publish image to ghcr.io/carl-castell/hunt-hub:<commit>
                              ──> migrate the production database (Neon) with that image
                              ──> Render deploys ("After CI checks pass") and only switches
                                  to the new version once GET /health returns 200
```

- Render waits for **all** CI checks of a commit, so the database is always migrated before the new version goes live.
- CI never cancels a run on `main`, so a migration can't be interrupted.
- `GET /health` shows the deployed commit (`"commit": "3bb1768"`).
- Production secrets: Render environment variables for the app; the GitHub environment `production` holds `NEON_DATABASE_URL` for the migration job.

Without Docker (e.g. Render's Node runtime), from the repo root:

```bash
npm ci --include=dev
npm run build -w web       # React app -> web/dist
npm run build -w backend   # API + server-rendered pages -> backend/dist
npm start -w backend       # runs with backend/ as working directory
```

---

## Backend

Express API and server-rendered web app. This is the current production application.

For detailed installation and setup instructions see [backend/README.md](backend/README.md). It also describes the [architecture](backend/README.md#architecture) (with a diagram), [security](backend/README.md#security) and [logging and monitoring](backend/README.md#logging-and-monitoring).

---

## Web

React web frontend, served under `/app`: the admin area and most of the manager area (dashboard, areas, events with guests and drives, the document check). The remaining manager pages (estate, guests, guest groups, staff) are still server-rendered and move step by step. Menu entries switch between the React pages and the server-rendered pages; both share one login session.

For detailed installation and setup instructions see [web/README.md](web/README.md).

---

## Mobile

React Native (Expo) iOS app. Managers and staff log in, see their estate's areas and stands on a map, edit stands in the field, download offline maps of their areas (or import .mbtiles files), and keep working without internet.

For detailed installation and setup instructions see [mobile/README.md](mobile/README.md).
