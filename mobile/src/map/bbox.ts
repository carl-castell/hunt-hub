export type BBox = [west: number, south: number, east: number, north: number]

/** Bounding box of any GeoJSON geometry, feature or collection; null when it has no coordinates. */
export function bboxOf(geojson: unknown): BBox | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity

  const visit = (coords: unknown): void => {
    if (!Array.isArray(coords)) return
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [x, y] = coords as number[]
      if (x < w) w = x
      if (x > e) e = x
      if (y < s) s = y
      if (y > n) n = y
      return
    }
    coords.forEach(visit)
  }

  const walk = (g: any): void => {
    if (!g || typeof g !== 'object') return
    if (g.type === 'FeatureCollection') g.features?.forEach(walk)
    else if (g.type === 'Feature') walk(g.geometry)
    else if (g.type === 'GeometryCollection') g.geometries?.forEach(walk)
    else visit(g.coordinates)
  }

  walk(geojson)
  return w === Infinity ? null : [w, s, e, n]
}

/** True when `inner` lies completely within `outer`. */
export function bboxContains(outer: BBox, inner: BBox) {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3]
}

/**
 * A boundary as stored, if it can be drawn: parsed, and with longitude/latitude
 * coordinates. A boundary uploaded before the server converted coordinate
 * systems may be in UTM metres; it would break the whole map, so it counts as
 * `broken` and isn't drawn.
 */
export function usableBoundary(geojson: string | null | undefined): { geometry: unknown; broken: boolean } {
  if (!geojson) return { geometry: null, broken: false }
  let geometry: unknown
  try {
    geometry = JSON.parse(geojson)
  } catch {
    return { geometry: null, broken: true }
  }
  const box = bboxOf(geometry)
  const lngLat = box !== null && box[0] >= -180 && box[2] <= 180 && box[1] >= -90 && box[3] <= 90
  return lngLat ? { geometry, broken: false } : { geometry: null, broken: true }
}
