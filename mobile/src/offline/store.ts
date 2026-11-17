import { randomUUID } from 'expo-crypto'
import { Directory, File, Paths } from 'expo-file-system'
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite'
import { getDb } from '../db/database'
import { bboxOf, type BBox } from '../map/bbox'
import type { OfflineSource } from './sources'
import { areaHectares, MAX_ZOOM, MIN_ZOOM, tilesForArea, tmsRow, type Tile } from './tiles'

/**
 * Storage of offline maps.
 *
 * - The list of maps (name, status, progress) is in the app database, table
 *   `offline_maps`, so screens can watch it with useQuery.
 * - The tiles are in ONE MBTiles file shared by all maps. `tiles` holds each
 *   tile once; `map_tiles` says which map needs which tile. Two overlapping
 *   areas share their common tiles, and deleting a map only removes tiles
 *   that no other map needs. The map engine reads the same file (mbtiles://).
 */

export type OfflineMapStatus = 'estimating' | 'estimated' | 'downloading' | 'paused' | 'complete' | 'failed'

export type OfflineMap = {
  id: string
  areaId: number
  areaName: string
  sourceId: string
  status: OfflineMapStatus
  areaHa: number
  tilesTotal: number
  tilesDone: number
  bytes: number
  estimatedBytes: number | null
  bounds: BBox | null
  error: string | null
  createdAt: string
  completedAt: string | null
  /** Set while the map is being updated: tiles fetched before this moment are downloaded again. */
  refreshBefore: string | null
}

export const OFFLINE_TILES_FILE = 'offline-tiles.mbtiles'

// Same folder as imported base maps. Only the file name is fixed; the folder's
// absolute path is rebuilt every time (iOS can move the app's container).
const tilesDir = () => new Directory(Paths.document, 'basemaps')
export const offlineTilesFile = () => new File(tilesDir(), OFFLINE_TILES_FILE)

let tileDb: SQLiteDatabase | null = null

/** The shared tile file, created on first use. */
export function getTileDb(): SQLiteDatabase {
  if (tileDb) return tileDb
  const dir = tilesDir()
  if (!dir.exists) dir.create({ intermediates: true })
  tileDb = openDatabaseSync(OFFLINE_TILES_FILE, {}, decodeURI(dir.uri.replace(/^file:\/\//, '')))
  // A rollback journal (not WAL): the map engine opens the file read-only and
  // must see every finished write without needing the WAL side files.
  tileDb.execSync(`
    PRAGMA journal_mode = DELETE;
    CREATE TABLE IF NOT EXISTS metadata (name TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS tiles (
      zoom_level INTEGER NOT NULL, tile_column INTEGER NOT NULL, tile_row INTEGER NOT NULL, tile_data BLOB NOT NULL,
      PRIMARY KEY (zoom_level, tile_column, tile_row)
    );
    CREATE TABLE IF NOT EXISTS map_tiles (
      map_id TEXT NOT NULL, z INTEGER NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL,
      PRIMARY KEY (map_id, z, x, y)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS map_tiles_tile ON map_tiles (z, x, y);
  `)
  // When each tile was fetched, for updating a map later. (Added after the first version of the file.)
  const columns = tileDb.getAllSync<{ name: string }>('PRAGMA table_info(tiles)')
  if (!columns.some((c) => c.name === 'fetched_at')) tileDb.execSync('ALTER TABLE tiles ADD COLUMN fetched_at TEXT')
  const meta: Record<string, string> = {
    name: 'Hunt Hub offline maps', format: 'jpg', type: 'baselayer', minzoom: String(MIN_ZOOM), maxzoom: String(MAX_ZOOM),
  }
  for (const [name, value] of Object.entries(meta)) {
    tileDb.runSync('INSERT OR IGNORE INTO metadata (name, value) VALUES (?, ?)', name, value)
  }
  return tileDb
}

const fromRow = (r: any): OfflineMap => ({
  id: r.id, areaId: r.area_id, areaName: r.area_name, sourceId: r.source_id, status: r.status,
  areaHa: r.area_ha, tilesTotal: r.tiles_total, tilesDone: r.tiles_done, bytes: r.bytes,
  estimatedBytes: r.estimated_bytes, bounds: r.bounds ? JSON.parse(r.bounds) : null,
  error: r.error, createdAt: r.created_at, completedAt: r.completed_at, refreshBefore: r.refresh_before ?? null,
})

export function listOfflineMaps(): OfflineMap[] {
  return getDb().getAllSync('SELECT * FROM offline_maps ORDER BY created_at').map(fromRow)
}

export function getOfflineMap(id: string): OfflineMap | null {
  const row = getDb().getFirstSync('SELECT * FROM offline_maps WHERE id = ?', id)
  return row ? fromRow(row) : null
}

export function offlineMapOfArea(areaId: number): OfflineMap | null {
  const row = getDb().getFirstSync('SELECT * FROM offline_maps WHERE area_id = ? ORDER BY created_at LIMIT 1', areaId)
  return row ? fromRow(row) : null
}

/**
 * Plans an offline map for an area: works out its tiles and stores the plan.
 * Nothing is downloaded yet. Returns the existing map if the area has one.
 */
export function planOfflineMap(area: { id: number; name: string }, boundary: unknown, source: OfflineSource): OfflineMap {
  const existing = offlineMapOfArea(area.id)
  if (existing) return existing

  const tiles = tilesForArea(boundary)
  const id = randomUUID()
  const db = getTileDb()
  db.withTransactionSync(() => {
    for (const t of tiles) db.runSync('INSERT OR IGNORE INTO map_tiles (map_id, z, x, y) VALUES (?, ?, ?, ?)', id, t.z, t.x, t.y)
  })
  getDb().runSync(
    `INSERT INTO offline_maps (id, area_id, area_name, source_id, status, area_ha, tiles_total, bounds, created_at)
     VALUES (?, ?, ?, ?, 'estimating', ?, ?, ?, ?)`,
    id, area.id, area.name, source.id, areaHectares(boundary), tiles.length,
    JSON.stringify(bboxOf(boundary)), new Date().toISOString(),
  )
  refreshProgress(id)
  return getOfflineMap(id)!
}

const TILE_JOIN = `LEFT JOIN tiles t ON t.zoom_level = m.z AND t.tile_column = m.x AND t.tile_row = (1 << m.z) - 1 - m.y`

function refreshBeforeOf(mapId: string): string | null {
  return getDb().getFirstSync<{ refresh_before: string | null }>('SELECT refresh_before FROM offline_maps WHERE id = ?', mapId)?.refresh_before ?? null
}

/**
 * Tiles of a map that still have to be downloaded: those not stored yet
 * (another map may already have brought some) and, during an update, those
 * fetched before the update began.
 */
export function missingTiles(mapId: string, limit: number): Tile[] {
  const before = refreshBeforeOf(mapId)
  return getTileDb().getAllSync<Tile>(
    `SELECT m.z, m.x, m.y FROM map_tiles m ${TILE_JOIN}
     WHERE m.map_id = ? AND (t.zoom_level IS NULL OR (? IS NOT NULL AND COALESCE(t.fetched_at, '') < ?))
     ORDER BY m.z, m.x, m.y LIMIT ?`,
    mapId, before, before, limit,
  )
}

export function saveTile(tile: Tile, data: Uint8Array) {
  getTileDb().runSync(
    'INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data, fetched_at) VALUES (?, ?, ?, ?, ?)',
    tile.z, tile.x, tmsRow(tile), data, new Date().toISOString(),
  )
}

/**
 * Counts a map's tiles that are done (during an update: already fetched
 * again) and its stored bytes, and writes them to the list, which updates
 * the screens.
 */
export function refreshProgress(mapId: string): { done: number; bytes: number } {
  const before = refreshBeforeOf(mapId)
  const row = getTileDb().getFirstSync<{ done: number; bytes: number }>(
    `SELECT COALESCE(SUM(CASE WHEN t.zoom_level IS NOT NULL AND (? IS NULL OR COALESCE(t.fetched_at, '') >= ?) THEN 1 ELSE 0 END), 0) AS done,
            COALESCE(SUM(LENGTH(t.tile_data)), 0) AS bytes
     FROM map_tiles m ${TILE_JOIN} WHERE m.map_id = ?`,
    before, before, mapId,
  ) ?? { done: 0, bytes: 0 }
  getDb().runSync('UPDATE offline_maps SET tiles_done = ?, bytes = ? WHERE id = ?', row.done, row.bytes, mapId)
  return row
}

/**
 * Marks a finished map for updating: all its tiles are downloaded again and
 * replaced one by one, so the map stays usable meanwhile. The caller starts
 * the download.
 */
export function markForUpdate(mapId: string, now = new Date()) {
  getDb().runSync('UPDATE offline_maps SET refresh_before = ? WHERE id = ?', now.toISOString(), mapId)
  refreshProgress(mapId)
}

export function setStatus(mapId: string, status: OfflineMapStatus, extra: { error?: string | null; estimatedBytes?: number } = {}) {
  getDb().runSync(
    `UPDATE offline_maps SET status = ?, error = ?, estimated_bytes = COALESCE(?, estimated_bytes),
       completed_at = CASE WHEN ? = 'complete' THEN ? ELSE completed_at END,
       refresh_before = CASE WHEN ? = 'complete' THEN NULL ELSE refresh_before END
     WHERE id = ?`,
    status, extra.error ?? null, extra.estimatedBytes ?? null, status, new Date().toISOString(), status, mapId,
  )
}

/** Removes a map. Tiles that another map still needs stay; the rest is deleted and the file shrunk. */
export function deleteOfflineMap(mapId: string) {
  const db = getTileDb()
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM map_tiles WHERE map_id = ?', mapId)
    db.runSync(
      `DELETE FROM tiles WHERE NOT EXISTS (
         SELECT 1 FROM map_tiles m WHERE m.z = zoom_level AND m.x = tile_column AND (1 << m.z) - 1 - m.y = tile_row)`,
    )
  })
  db.execSync('VACUUM')
  getDb().runSync('DELETE FROM offline_maps WHERE id = ?', mapId)
}

/** Bytes the shared tile file takes on the phone. */
export function offlineStorageBytes(): number {
  const file = offlineTilesFile()
  return file.exists ? file.size ?? 0 : 0
}
