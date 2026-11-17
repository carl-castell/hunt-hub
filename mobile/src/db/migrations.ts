// Local SQLite schema. Append new entries; never edit an existing one.
// The index + 1 is stored in PRAGMA user_version.
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE areas (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    geojson TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE stands (
    id INTEGER PRIMARY KEY,
    area_id INTEGER NOT NULL,
    number TEXT NOT NULL,
    lng REAL,
    lat REAL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX stands_area_id ON stands(area_id);
  -- Local changes waiting to be pushed. status: 'pending' | 'rejected'
  CREATE TABLE outbox (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    last_error TEXT
  );
  CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT);
  -- Imported MBTiles files; device-only, never synced.
  CREATE TABLE basemaps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    file_name TEXT NOT NULL,
    format TEXT NOT NULL,
    minzoom INTEGER,
    maxzoom INTEGER,
    bounds TEXT,
    created_at TEXT NOT NULL
  );
  `,
  `
  -- Layer choice on each area's map (base map, stands and boundary on/off).
  CREATE TABLE area_map_settings (
    area_id INTEGER PRIMARY KEY,
    basemap_id TEXT,
    show_stands INTEGER NOT NULL DEFAULT 1,
    show_boundary INTEGER NOT NULL DEFAULT 1
  );
  -- App settings of this phone (e.g. coordinate format); kept on logout.
  CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT);
  `,
  `
  -- Nickname and status of stands (HUN-83). status: 'ok' | 'needs_repair' | 'broken' | 'removed' | NULL
  ALTER TABLE stands ADD COLUMN nickname TEXT;
  ALTER TABLE stands ADD COLUMN status TEXT;
  ALTER TABLE stands ADD COLUMN status_date TEXT;
  -- Pull everything again once: stands already on the phone haven't changed
  -- on the server, so an ordinary sync would never send their new fields.
  DELETE FROM sync_state WHERE key = 'cursor';
  `,
  `
  -- Offline maps downloaded for an area (HUN-68). The tiles themselves are in a
  -- separate MBTiles file that all maps share (src/offline/store.ts).
  -- status: 'estimating' | 'estimated' | 'downloading' | 'paused' | 'complete' | 'failed'
  CREATE TABLE offline_maps (
    id TEXT PRIMARY KEY,
    area_id INTEGER NOT NULL,
    area_name TEXT NOT NULL,
    source_id TEXT NOT NULL,
    status TEXT NOT NULL,
    area_ha REAL NOT NULL,
    tiles_total INTEGER NOT NULL,
    tiles_done INTEGER NOT NULL DEFAULT 0,
    bytes INTEGER NOT NULL DEFAULT 0,
    estimated_bytes INTEGER,
    bounds TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
  );
  `,
  `
  -- Updating an offline map: tiles fetched before this moment are downloaded again.
  ALTER TABLE offline_maps ADD COLUMN refresh_before TEXT;
  `,
]
