import type { SQLiteDatabase } from 'expo-sqlite'
import type { CoordinateFormat } from '../map/coords'
import type { BoundaryStyle } from '../map/style'
import { useQuery } from './useQuery'
import { getDb } from './database'

export type AreaMapSettings = { basemapId: string | null; showStands: boolean; showBoundary: boolean }

const DEFAULT_AREA_SETTINGS: AreaMapSettings = { basemapId: null, showStands: true, showBoundary: true }

export function getAreaMapSettings(db: SQLiteDatabase, areaId: number): AreaMapSettings {
  const row = db.getFirstSync<{ basemap_id: string | null; show_stands: number; show_boundary: number }>(
    'SELECT basemap_id, show_stands, show_boundary FROM area_map_settings WHERE area_id = ?', areaId,
  )
  if (!row) return DEFAULT_AREA_SETTINGS
  return { basemapId: row.basemap_id, showStands: row.show_stands === 1, showBoundary: row.show_boundary === 1 }
}

export function saveAreaMapSettings(db: SQLiteDatabase, areaId: number, settings: AreaMapSettings) {
  db.runSync(
    `INSERT INTO area_map_settings (area_id, basemap_id, show_stands, show_boundary) VALUES (?, ?, ?, ?)
     ON CONFLICT(area_id) DO UPDATE SET basemap_id = excluded.basemap_id,
       show_stands = excluded.show_stands, show_boundary = excluded.show_boundary`,
    areaId, settings.basemapId, settings.showStands ? 1 : 0, settings.showBoundary ? 1 : 0,
  )
}

// App settings of this phone.
export type Preferences = { coordinateFormat: CoordinateFormat; showCrosshair: boolean; showRings: boolean; boundaryStyle: BoundaryStyle }

const DEFAULT_PREFERENCES: Preferences = { coordinateFormat: 'decimal', showCrosshair: true, showRings: false, boundaryStyle: 'inverted' }

export function getPreferences(db: SQLiteDatabase): Preferences {
  const rows = db.getAllSync<{ key: string; value: string }>('SELECT key, value FROM preferences')
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return {
    coordinateFormat: map.coordinateFormat === 'utm' ? 'utm' : DEFAULT_PREFERENCES.coordinateFormat,
    showCrosshair: map.showCrosshair === undefined ? DEFAULT_PREFERENCES.showCrosshair : map.showCrosshair === '1',
    showRings: map.showRings === undefined ? DEFAULT_PREFERENCES.showRings : map.showRings === '1',
    boundaryStyle: map.boundaryStyle === 'line' ? 'line' : DEFAULT_PREFERENCES.boundaryStyle,
  }
}

export function setPreference<K extends keyof Preferences>(db: SQLiteDatabase, key: K, value: Preferences[K]) {
  const stored = typeof value === 'boolean' ? (value ? '1' : '0') : String(value)
  db.runSync('INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, stored)
}

/** The app settings, re-read whenever they change. */
export function usePreferences(): Preferences {
  return useQuery(() => getPreferences(getDb()), ['preferences'])
}
