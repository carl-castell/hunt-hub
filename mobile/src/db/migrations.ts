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
]
