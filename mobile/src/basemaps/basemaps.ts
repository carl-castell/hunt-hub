import { randomUUID } from 'expo-crypto'
import * as DocumentPicker from 'expo-document-picker'
import { Directory, File, Paths } from 'expo-file-system'
import { openDatabaseAsync } from 'expo-sqlite'
import { getDb } from '../db/database'
import type { BBox } from '../map/bbox'
import { BasemapError, parseMbtilesMetadata } from './metadata'

export type Basemap = {
  id: string
  name: string
  fileName: string
  format: string
  minzoom: number | null
  maxzoom: number | null
  bounds: BBox | null
}

// Only the file name is stored: iOS can move the app's container between updates,
// so the absolute path is rebuilt every time.
const basemapsDir = () => new Directory(Paths.document, 'basemaps')
export const basemapFile = (fileName: string) => new File(basemapsDir(), fileName)

export function listBasemaps(): Basemap[] {
  return getDb().getAllSync<any>('SELECT * FROM basemaps ORDER BY created_at').map((r) => ({
    id: r.id,
    name: r.name,
    fileName: r.file_name,
    format: r.format,
    minzoom: r.minzoom,
    maxzoom: r.maxzoom,
    bounds: r.bounds ? JSON.parse(r.bounds) : null,
  }))
}

async function readMbtiles(file: File, fallbackName: string) {
  const dir = file.parentDirectory.uri.replace(/^file:\/\//, '')
  const mb = await openDatabaseAsync(file.name, { useNewConnection: true }, decodeURI(dir))
  try {
    const tables = await mb.getAllAsync<{ name: string }>(`SELECT name FROM sqlite_master WHERE name IN ('metadata', 'tiles')`)
    if (tables.length < 2) throw new BasemapError('This file is not a valid MBTiles file.')
    const rows = await mb.getAllAsync<{ name: string; value: string }>('SELECT name, value FROM metadata')
    const tile = await mb.getFirstAsync<{ tile_data: Uint8Array }>('SELECT tile_data FROM tiles LIMIT 1')
    return parseMbtilesMetadata(rows, fallbackName, tile?.tile_data ?? null)
  } catch (err) {
    if (err instanceof BasemapError) throw err
    throw new BasemapError('This file is not a valid MBTiles file.')
  } finally {
    await mb.closeAsync()
  }
}

/** Lets the user pick a .mbtiles file (Files app, iCloud Drive, AirDrop…) and imports it. */
export async function pickAndImportBasemap(): Promise<Basemap | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false })
  if (picked.canceled || !picked.assets?.[0]) return null
  const asset = picked.assets[0]
  if (!asset.name.toLowerCase().endsWith('.mbtiles')) {
    new File(asset.uri).delete()
    throw new BasemapError('Please choose a .mbtiles file.')
  }

  const dir = basemapsDir()
  if (!dir.exists) dir.create({ intermediates: true })
  const id = randomUUID()
  const fileName = `${id}.mbtiles`
  const target = new File(dir, fileName)
  new File(asset.uri).move(target)

  try {
    const info = await readMbtiles(target, asset.name.replace(/\.mbtiles$/i, ''))
    getDb().runSync(
      `INSERT INTO basemaps (id, name, file_name, format, minzoom, maxzoom, bounds, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id, info.name, fileName, info.format, info.minzoom, info.maxzoom,
      info.bounds ? JSON.stringify(info.bounds) : null, new Date().toISOString(),
    )
    return { id, fileName, ...info }
  } catch (err) {
    if (target.exists) target.delete()
    throw err
  }
}

export function deleteBasemap(basemap: Basemap) {
  const file = basemapFile(basemap.fileName)
  if (file.exists) file.delete()
  getDb().runSync('DELETE FROM basemaps WHERE id = ?', basemap.id)
}
