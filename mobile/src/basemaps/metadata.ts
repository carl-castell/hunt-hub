import type { BBox } from '../map/bbox'

export const RASTER_FORMATS = ['png', 'jpg', 'webp'] as const
export type RasterFormat = typeof RASTER_FORMATS[number]

export type BasemapInfo = {
  name: string
  format: RasterFormat
  minzoom: number | null
  maxzoom: number | null
  bounds: BBox | null
}

export class BasemapError extends Error {}

/** Detects the tile image type from its first bytes (used when metadata has no `format`). */
export function sniffTileFormat(bytes: Uint8Array): RasterFormat | 'pbf' | null {
  const b = bytes
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'webp'
  if (b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b) return 'pbf' // gzip: vector tiles
  return null
}

function normalizeFormat(format: string | undefined): RasterFormat | 'pbf' | null {
  const f = format?.trim().toLowerCase()
  if (!f) return null
  if (f === 'jpeg') return 'jpg'
  if (f === 'pbf' || f === 'mvt') return 'pbf'
  return (RASTER_FORMATS as readonly string[]).includes(f) ? (f as RasterFormat) : null
}

function parseBounds(value: string | undefined): BBox | null {
  if (!value) return null
  const parts = value.split(',').map((p) => Number(p.trim()))
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) return null
  return parts as BBox
}

function parseZoom(value: string | undefined): number | null {
  if (value == null || value === '') return null
  const z = Number(value)
  return Number.isInteger(z) && z >= 0 && z <= 24 ? z : null
}

/**
 * Validates an MBTiles `metadata` table. Only raster tilesets are supported.
 * `firstTile` is used when the metadata doesn't say which image format the tiles are.
 */
export function parseMbtilesMetadata(
  rows: Array<{ name: string; value: string }>,
  fallbackName: string,
  firstTile: Uint8Array | null,
): BasemapInfo {
  const meta = Object.fromEntries(rows.map((r) => [r.name.toLowerCase(), r.value]))

  let format = normalizeFormat(meta.format)
  if (!format && firstTile) format = sniffTileFormat(firstTile)

  if (format === 'pbf') throw new BasemapError('This is a vector MBTiles file. Only raster maps (PNG, JPG, WebP) are supported.')
  if (!format) {
    if (!firstTile) throw new BasemapError('This MBTiles file contains no tiles.')
    throw new BasemapError('Unknown tile format. Only raster maps (PNG, JPG, WebP) are supported.')
  }

  return {
    name: meta.name?.trim() || fallbackName,
    format,
    minzoom: parseZoom(meta.minzoom),
    maxzoom: parseZoom(meta.maxzoom),
    bounds: parseBounds(meta.bounds),
  }
}
