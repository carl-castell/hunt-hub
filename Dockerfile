# syntax=docker/dockerfile:1
#
# One image for the whole web application: the Express backend (API and
# server-rendered pages) plus the built React app it serves under /app.
# Database (Neon / PostGIS), file storage (R2 / RustFS) and mail stay outside
# the container and are configured through environment variables.
#
#   docker build -t hunt-hub .
#   docker run --env-file backend/.env -p 3000:3000 hunt-hub

ARG NODE_VERSION=22

# ── 1. Install all dependencies of backend and web (incl. build tools) ──────
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY web/package.json web/
COPY scripts/docker/keep-workspaces.mjs /tmp/
# The iPhone app is not part of this image: reduce package.json and the
# lockfile to backend + web (see the script), then install exactly the
# locked versions.
RUN node /tmp/keep-workspaces.mjs backend web \
 && npm ci --include=dev --no-audit --no-fund

# ── 2. Build the React app and the backend ───────────────────────────────────
FROM deps AS build
COPY backend backend
COPY web web
RUN npm run build --workspace web && npm run build --workspace backend

# ── 3. Production dependencies of the backend only ──────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY scripts/docker/keep-workspaces.mjs /tmp/
# Only the backend runs in production; web is already built into static files.
RUN node /tmp/keep-workspaces.mjs backend \
 && npm ci --omit=dev --no-audit --no-fund

# ── 4. Runtime image ─────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
# Packages whose version differs from the hoisted one live in the workspace's
# own node_modules (e.g. @trpc/server, because the iPhone app pins another version).
COPY --from=prod-deps /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/web/dist ./web/dist
COPY backend/package.json ./backend/
# Files the backend reads at runtime (relative to backend/):
COPY backend/views ./backend/views
COPY backend/public ./backend/public
COPY backend/src/mail-views ./backend/src/mail-views
# Migrations, so `node dist/src/db/migrate.js` can run from this image
COPY backend/drizzle ./backend/drizzle

# The app reads views/, public/ and ../web/dist relative to its working directory.
WORKDIR /app/backend
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:' + process.env.PORT + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# node directly (not npm), so SIGTERM reaches the app for a graceful shutdown.
CMD ["node", "dist/src/index.js"]
