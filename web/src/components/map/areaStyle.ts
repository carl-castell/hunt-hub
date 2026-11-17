import type { StyleSpecification } from 'maplibre-gl'
import { maskOutside } from './mask'

export const BOUNDARY_COLOR = '#dc2626'

export type BasemapId = 'satellite' | 'topo' | 'osm'

/** inverted: everything outside the area shaded red, plus the line (default). line: only the line. */
export type BoundaryStyle = 'inverted' | 'line'

/** The base maps, in the order of the layer menu. Satellite is the default when the page opens. */
export const BASEMAPS: { id: BasemapId; label: string; tiles: string[]; maxzoom: number; attribution: string }[] = [
  {
    id: 'satellite',
    label: 'Satellite',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    maxzoom: 19,
    attribution: '© <a href="https://www.esri.com">Esri</a>',
  },
  {
    id: 'topo',
    label: 'OpenTopoMap',
    tiles: ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
    maxzoom: 17,
    attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA), © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  {
    id: 'osm',
    label: 'OpenStreetMap',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    maxzoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
]

export const DEFAULT_BASEMAP: BasemapId = 'satellite'

/**
 * The map style for one area: the chosen base map, and the boundary on top
 * when it is shown. Inverted: everything outside the area is shaded red. The boundary is
 * part of the style itself, so it is drawn as soon as the map renders.
 */
export function areaStyle(
  basemapId: BasemapId, boundary: GeoJSON.Geometry | null, showBoundary: boolean, boundaryStyle: BoundaryStyle = 'inverted',
): StyleSpecification {
  const base = BASEMAPS.find((b) => b.id === basemapId) ?? BASEMAPS[0]
  const style: StyleSpecification = {
    version: 8,
    sources: {
      base: { type: 'raster', tiles: base.tiles, tileSize: 256, maxzoom: base.maxzoom, attribution: base.attribution },
    },
    layers: [{ id: 'base', type: 'raster', source: 'base' }],
  }

  const mask = boundary && showBoundary && boundaryStyle === 'inverted' ? maskOutside(boundary) : null
  if (boundary && showBoundary) {
    if (mask) {
      style.sources.outside = { type: 'geojson', data: mask }
      style.layers.push({ id: 'outside-shade', type: 'fill', source: 'outside', paint: { 'fill-color': BOUNDARY_COLOR, 'fill-opacity': 0.25 } })
    }
    style.sources.boundary = { type: 'geojson', data: boundary }
    style.layers.push({ id: 'boundary-line', type: 'line', source: 'boundary', paint: { 'line-color': BOUNDARY_COLOR, 'line-width': 2.5 } })
  }
  return style
}
