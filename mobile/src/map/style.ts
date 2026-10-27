import type { StyleSpecification } from '@maplibre/maplibre-react-native'
import { ONLINE_TOPO } from '../config'

export type BasemapChoice =
  | { kind: 'online' }
  | { kind: 'none' }
  | { kind: 'mbtiles'; filePath: string; minzoom?: number | null; maxzoom?: number | null; name: string }

/** MapLibre Native reads MBTiles files directly via `mbtiles:///absolute/path`. */
export function mbtilesUrl(filePath: string) {
  const path = decodeURI(filePath.replace(/^file:\/\//, ''))
  return `mbtiles://${path.startsWith('/') ? path : `/${path}`}`
}

/** Full MapLibre style for one area: a basemap plus the area outline on top. */
export function buildAreaStyle(basemap: BasemapChoice, areaGeojson: object | null): StyleSpecification {
  const sources: StyleSpecification['sources'] = {}
  const layers: StyleSpecification['layers'] = [
    { id: 'background', type: 'background', paint: { 'background-color': '#eef0e6' } },
  ]

  if (basemap.kind === 'online') {
    sources.base = {
      type: 'raster', tiles: ONLINE_TOPO.tiles, tileSize: 256,
      maxzoom: ONLINE_TOPO.maxzoom, attribution: ONLINE_TOPO.attribution,
    }
  } else if (basemap.kind === 'mbtiles') {
    sources.base = {
      type: 'raster', url: mbtilesUrl(basemap.filePath), tileSize: 256,
      ...(basemap.minzoom != null ? { minzoom: basemap.minzoom } : {}),
      ...(basemap.maxzoom != null ? { maxzoom: basemap.maxzoom } : {}),
    }
  }
  if (sources.base) layers.push({ id: 'base', type: 'raster', source: 'base' })

  if (areaGeojson) {
    sources.area = { type: 'geojson', data: areaGeojson as any }
    layers.push(
      { id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': '#d9480f', 'fill-opacity': 0.12 } },
      { id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': '#d9480f', 'line-width': 2.5 } },
    )
  }

  return { version: 8, sources, layers }
}
