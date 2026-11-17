import type { StyleSpecification } from '@maplibre/maplibre-react-native'
import { maskOutside } from './mask'

/** Same red as the boundary on the website. */
export const BOUNDARY_COLOR = '#dc2626'

/** inverted: everything outside the area shaded red, plus the line. line: only the line. */
export type BoundaryStyle = 'inverted' | 'line'

export type BasemapChoice =
  | { kind: 'online'; tiles: string[]; maxzoom: number; attribution: string }
  | { kind: 'mbtiles'; filePath: string; minzoom?: number | null; maxzoom?: number | null; name: string }

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

  if (basemap.kind === 'online') {
    sources.base = {
      type: 'raster', tiles: basemap.tiles, tileSize: 256,
      maxzoom: basemap.maxzoom, attribution: basemap.attribution,
    }
  } else {
    sources.base = {
      type: 'raster', url: mbtilesUrl(basemap.filePath), tileSize: 256,
      ...(basemap.minzoom != null ? { minzoom: basemap.minzoom } : {}),
      ...(basemap.maxzoom != null ? { maxzoom: basemap.maxzoom } : {}),
    }
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
