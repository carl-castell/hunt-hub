# Hunt Hub — iOS app

React Native app built with Expo (development build). Managers and staff can:

- log in (needs internet the first time only),
- see their estate's areas and open each one on a map with its boundary and stands,
- find stands in a searchable list (number or nickname), open a stand's page, and share its position as a Google Maps link,
- as a manager: create and move stands in edit mode, and rename, describe (nickname, status) or delete a stand on its page, also offline,
- choose the base map per area: satellite, OpenTopoMap, OpenStreetMap, the state survey's aerial photo, or an imported `.mbtiles` file,
- download the aerial photo of an area as an offline map (Settings → Offline maps),
- read the coordinates of the map centre (decimal degrees or UTM), the GPS accuracy and distance rings,
- show their location on the map,
- keep using everything offline. Data syncs when the connection comes back.

## Requirements

- **Node 22.13 or newer** (Expo SDK 58). `brew install node@22` or use a version manager.
- **Xcode** (from the App Store), opened once to install the iOS simulator and accept the license.
  Then: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
- The backend running locally (see `backend/README.md`) with migrations applied: `npm run db:migrate -w @hunt-hub/backend`.

Expo Go does **not** work: the map (MapLibre) is a native module, so the app runs as its own development build.

## Run in the simulator

```bash
npm install                       # from the repo root
cp mobile/.env.example mobile/.env.local
cd mobile
npm run ios                       # builds the app, installs it in the simulator, starts Metro
```

The first build takes a few minutes. After that, `npm start` is enough while the app is installed.

Log in with a **manager** or **staff** account. Admin and guest accounts are refused.

## Which backend the app talks to

Set `EXPO_PUBLIC_API_URL` in `mobile/.env.local` and restart Metro with `npx expo start -c` (the value is built into the bundle):

| Backend | `EXPO_PUBLIC_API_URL` |
|---|---|
| Local, in the simulator | `http://localhost:3000` |
| Local, on your iPhone | `http://<your Mac's local IP>:3000` |
| Production | `https://hunt-hub-docker.onrender.com` |

On the free Render plan the first request after a quiet period can take up to a minute while the server starts; the app shows a sync error once and recovers on the next sync.

## Run on your iPhone

1. Connect the phone by USB and enable Developer Mode on it (Settings → Privacy & Security).
2. In `.env.local` set `EXPO_PUBLIC_API_URL` to your Mac's local IP (the phone can't reach `localhost`).
3. Build and install one or both variants. The first time, Xcode asks you to pick a signing team; a free Apple ID works
   (the app then needs re-installing every 7 days; a paid developer account removes that limit).

Two variants can be installed side by side (`app.config.ts`):

| Variant | Command | On the phone | JavaScript |
|---|---|---|---|
| Development | `npm run ios:device`, then `npm start` | "Hunt Hub Dev" | loaded from Metro on the Mac; live reload; doesn't start without the Mac |
| Release | `npm run ios:device:release` | "Hunt Hub" | embedded in the app; starts offline; rebuild after every change |

Use the release variant to test offline mode, and for testers and demos. Both commands regenerate the `ios/` folder
(`expo prebuild --clean`), because the variants have different bundle identifiers. `EXPO_PUBLIC_API_URL` is built
into the release app when you build it.

To share builds without a cable later: `npx eas-cli@latest build --platform ios` (paid Apple developer account).

## How offline works

- Everything the screens show comes from a local SQLite database (`src/db/`). Screens never read from the network.
- The sync engine (`src/sync/engine.ts`) first uploads queued changes (`outbox` table), then downloads what changed
  on the server since the last sync (`mobile.sync.pull`). It runs after login, when the connection returns,
  when the app is opened, every 5 minutes, and on pull-to-refresh.
- Login tokens are kept in the iOS Keychain. Being offline never logs you out. If the server rejects the session
  (expired after 60 days unused, or revoked), you're asked to log in again. Offline data and queued changes are kept.
- Offline maps and imported basemaps are stored in the app's Documents folder, are never synced and are kept on logout.

## The area map

| Part | Where |
|---|---|
| Screen: buttons (layers, settings, whole area, location, compass), layer menu, info bar | `src/app/(app)/area/[id].tsx`, `src/ui/LayerSheet.tsx`, `src/ui/MapOverlays.tsx` |
| Map style: base map, boundary inverted (red outside) or line only | `src/map/style.ts`, `src/map/mask.ts` (same as the website's) |
| Base maps and the default per area | `src/map/sources.ts`, `src/map/layerChoice.ts` |
| Coordinates (UTM), GPS accuracy, distance rings | `src/map/coords.ts`, `src/map/scale.ts` |
| Saved choices: layers per area (`area_map_settings`), app settings (`preferences`, kept on logout) | `src/db/mapSettings.ts` |

All of `src/map/` is plain TypeScript with unit tests.

## Stands

| Part | Where |
|---|---|
| Markers by zoom level, search, Google Maps link | `src/map/stands.ts` |
| Stand panel on the map, stand page, stand list | `src/ui/StandSheet.tsx`, `src/app/(app)/stand/[id].tsx`, `src/app/(app)/stands/[areaId].tsx` |
| Edit mode (off after every app start), new stand, number, nickname and status | `src/edit/`, `src/ui/StandFormSheet.tsx`, `src/ui/StandDetailsSheet.tsx` |
| Status codes, labels and colours (one place, for the later translation) | `src/stands/status.ts` |
| Local change + queued change in one transaction; undo if the server refuses | `src/db/standEdits.ts` |

Performance: the map reports its position on every frame while it moves, and the screen re-renders for the
coordinates and distance rings. The stand markers are therefore a memoised component (`StandMarkers` in
`src/app/(app)/area/[id].tsx`) and only change size when the zoom rests or the gesture ends, not in the middle of a
pinch. Keep it that way: anything that touches every marker on every frame makes zooming stutter.

A new stand has a temporary negative id until the server confirms it. The server's rules (own estate, managers only,
a number once per area) are in `backend/src/services/stands.ts`, shared with the website and QGIS.

### Adding an editable feature

1. App: write the change locally and call `enqueue(db, 'stand.move', payload)` in the same transaction (`src/sync/outbox.ts`).
2. Backend: add a handler in `backend/src/sync/handlers/` and register it. It gets the validated payload, a transaction and the user.
3. The queue, retries, exactly-once delivery and pulling the result back are already handled.

## Offline maps

Settings → Offline maps lists everything stored on the phone for use without internet: downloaded area maps and
imported `.mbtiles` files. "Clear map cache" there only removes tiles the map engine kept from browsing online maps.

| Part | Where |
|---|---|
| Which tiles an area needs: 512 px tiles, zoom 10–17, the boundary plus a margin (50 m at zoom 17, doubling per coarser zoom) | `src/offline/tiles.ts` |
| Sources: open-data aerial photos of the state surveys over WMS (Bavaria, Brandenburg) | `src/offline/sources.ts` |
| Storage: the list of maps (`offline_maps` table) and one shared MBTiles file | `src/offline/store.ts` |
| Download manager: estimate, download, pause, resume, update | `src/offline/downloader.ts`, `src/offline/eta.ts` |
| Screens: choose an area, follow a download | `src/app/(app)/offline/` |
| On the map: stored tiles below the online photo; question to switch when offline | `src/map/style.ts`, `src/map/layerChoice.ts`, `src/app/(app)/area/[id].tsx` |

- **Why these sources:** their licences (CC BY 4.0, dl-de/by-2-0) allow storing the photos with attribution. Esri's
  satellite tiles may only be shown online. To add a state, add one entry to `OFFLINE_SOURCES`.
- **One tile store for all maps:** `Documents/basemaps/offline-tiles.mbtiles`. `tiles` holds each tile once,
  `map_tiles` says which map needs which tile. Overlapping areas share tiles; deleting a map only removes tiles no
  other map needs. MapLibre reads the same file (`mbtiles://`).
- **The download belongs to the app, not to a screen.** It continues on other screens, waits while the app is in
  the background or offline, and resumes after the app was closed (progress is stored after every batch). It does
  not run while the app is closed.
- **Without a connection** the map never switches by itself: after 5 seconds offline, if an online map is shown and
  the area has an offline map, the app asks whether to switch.
- **Update** downloads a map again (the services don't say when a tile changed) and replaces tiles one by one.

## Tests

```bash
npm test            # unit tests: sync engine, MBTiles validation, map and stand helpers, offline maps (tile choice, storage rules)
npm run typecheck
```

The storage rules of offline maps (`src/offline/store.test.ts`) run against Node's built-in SQLite in place of the phone's, so they need Node 22.
