import type { StyleSpecification } from '@maplibre/maplibre-react-native'
import { maskOutside } from './mask'

/** Same red as the boundary on the website. */
export const BOUNDARY_COLOR = '#dc2626'

/** inverted: everything outside the area shaded red, plus the line. line: only the line. */
export type BoundaryStyle = 'inverted' | 'line'

/** Tiles stored on the phone (an MBTiles file), shown wherever the online map has nothing (yet). */
export type StoredTiles = { filePath: string; tileSize: number; minzoom?: number | null; maxzoom?: number | null }

export type BasemapChoice =
  | {
      kind: 'online'; tiles: string[]; maxzoom: number; attribution: string
      /** Pixel size of the source's tiles; 256 unless stated. */
      tileSize?: number
      /** The same map stored offline. Drawn below the online tiles, so it shows at once and when there is no connection. */
      stored?: StoredTiles
    }
  | { kind: 'mbtiles'; filePath: string; minzoom?: number | null; maxzoom?: number | null; name: string; tileSize?: number }

/** MapLibre Native reads MBTiles files directly via `mbtiles:///absolute/path`. */
export function mbtilesUrl(filePath: string) {
  const path = decodeURI(filePath.replace(/^file:\/\//, ''))
  return `mbtiles://${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Full MapLibre style for one area: a base map, plus the boundary on top when it is shown.
 * Inverted (as on the website): everything outside the area is shaded red and the area itself stays clear.
 */
export function buildAreaStyle(
  basemap: BasemapChoice, areaGeojson: object | null, showBoundary = true, boundaryStyle: BoundaryStyle = 'inverted',
): StyleSpecification {
  const sources: StyleSpecification['sources'] = {}
  const layers: StyleSpecification['layers'] = [
    { id: 'background', type: 'background', paint: { 'background-color': '#eef0e6' } },
  ]

  const fromFile = (file: StoredTiles) => ({
    type: 'raster' as const, url: mbtilesUrl(file.filePath), tileSize: file.tileSize,
    ...(file.minzoom != null ? { minzoom: file.minzoom } : {}),
    ...(file.maxzoom != null ? { maxzoom: file.maxzoom } : {}),
  })

  if (basemap.kind === 'online') {
    if (basemap.stored) {
      // Below the online tiles: visible at once, and all there is without a connection.
      // Online tiles cover it as they arrive, also beyond the stored area.
      sources.stored = fromFile(basemap.stored)
      layers.push({ id: 'stored', type: 'raster', source: 'stored' })
    }
    sources.base = {
      type: 'raster', tiles: basemap.tiles, tileSize: basemap.tileSize ?? 256,
      maxzoom: basemap.maxzoom, attribution: basemap.attribution,
    }
  } else {
    sources.base = fromFile({ ...basemap, tileSize: basemap.tileSize ?? 256 })
  }
  layers.push({ id: 'base', type: 'raster', source: 'base' })

  if (areaGeojson && showBoundary) {
    const mask = boundaryStyle === 'inverted' ? maskOutside(areaGeojson as GeoJSON.Geometry) : null
    if (mask) {
      sources.outside = { type: 'geojson', data: mask }
      layers.push({ id: 'outside-shade', type: 'fill', source: 'outside', paint: { 'fill-color': BOUNDARY_COLOR, 'fill-opacity': 0.25 } })
    }
    sources.area = { type: 'geojson', data: areaGeojson as any }
    layers.push({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': BOUNDARY_COLOR, 'line-width': 2.5 } })
  }

  return { version: 8, sources, layers }
}
