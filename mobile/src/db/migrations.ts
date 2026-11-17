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
]
