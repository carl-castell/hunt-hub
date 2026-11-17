# Hunt Hub — Web

The React app (Vite, TypeScript, Tailwind, shadcn/ui, tRPC + React Query). It is served by the backend under **`/app`**, next to the server-rendered pages, and shares their login session.

| Area | Path | Status |
|---|---|---|
| Login and two-factor login | `/app/login`, `/app/totp…` | everyone uses it (`/` and `/login` redirect here) |
| Admin area | `/app/admin` | complete |
| Manager pages | `/app/manager/areas…` | Areas (list; each area as a full-page map with layers, legend, stands panel and settings); more screens move here step by step |

## How old and new pages fit together

- **One menu for both:** the manager menu is defined once in `backend/src/shared/managerNav.ts`. Entries with `inReactApp: true` open React pages, the others open the server-rendered pages (full page load). Moving a screen to React means building it here and flipping that flag.
- **One session:** in production the backend serves `web/dist` at `/app` (same origin); in development Vite forwards every path outside `/app` to the backend.
- **API:** pages call the backend through a typed tRPC client (`src/lib/trpc.ts`); file uploads (FormData) are sent without batching.
- **Roles:** `RequireRole` keeps admins and managers in their own area; the server checks the role again on every call.

## Setup

From the repo root, install all dependencies:

```bash
npm install
```

## Development

Start the backend first (see `backend/README.md`):

```bash
cd ../backend && npm run dev     # http://localhost:3000
```

Then the React app:

```bash
npm run dev                      # http://localhost:5173/app/
```

Open **http://localhost:5173/app/** (or `/login`). Vite serves `/app` with hot reload and forwards everything else (`/manager`, `/api`, `/login`, …) to the backend, so old and new pages work together like in production.

## Tests and build

```bash
npm test          # Vitest: roles, map framing, boundary mask, map style, stand search
npm run build     # type check + production build -> dist/
```

## Notes

- **UI components:** shadcn/ui in `src/components/ui/`. Add new ones with `npx shadcn@latest add <name>`; the `@/` alias in `tsconfig.json` makes the CLI write to `src/`.
- **Map:** MapLibre GL (`src/components/map/`). Its web worker is registered explicitly in `maplibre.ts`, so it also loads after Vite's bundling. Base maps: satellite (default), OpenTopoMap, OpenStreetMap (`areaStyle.ts`). The map is created once per area; switching the base map or layers only updates its style, so the view stays put.
