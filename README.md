# Hunt Hub

[![CI](https://github.com/carl-castell/hunt-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/carl-castell/hunt-hub/actions/workflows/ci.yml)

> **Work in progress.** Hunt Hub is currently under active development.

A platform for managing hunting estates, events, and guests.

Hunt Hub started as a server-rendered web application and is being expanded with a React frontend and React Native mobile app.

## Getting Started

This is an npm workspaces monorepo (`backend/`, `web/`, `mobile/`) with **one lockfile in the repo root**. Use Node.js 22 (see `.node-version`) and always install from the repo root:

```bash
npm install
```

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

For detailed installation and setup instructions see [backend/README.md](backend/README.md).

---

## Web

React web frontend, served under `/app`: the admin area and, step by step, the manager area (starting with Areas). Menu entries switch between the React pages and the server-rendered pages; both share one login session.

For detailed installation and setup instructions see [web/README.md](web/README.md).

---

## Mobile

React Native (Expo) iOS app — in development. Managers and staff log in, see their estate's areas on a map, import offline basemaps (.mbtiles), and keep working without internet.

For detailed installation and setup instructions see `mobile/README.md`.
