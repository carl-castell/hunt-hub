/**
 * Which map tiles an offline map needs. Pure maths, no network or storage.
 *
 * Tiles are the usual web map tiles (z/x/y, Web Mercator), requested at
 * 512 px. A 512 px tile at zoom 17 has the detail of zoom 18 at 256 px, with
 * a quarter of the requests and database rows.
 *
 * Only tiles that touch the area are kept: the boundary grown by a margin
 * of 50 m at the most detailed zoom, doubling with every coarser zoom (where
 * a tile covers far more ground and costs almost nothing).
 */

export type Tile = { z: number; x: number; y: number }
type Point = [number, number]
type Rect = { minX: number; minY: number; maxX: number; maxY: number }

export const TILE_SIZE = 512
export const MIN_ZOOM = 10
export const MAX_ZOOM = 17
export const BASE_MARGIN_METRES = 50
export const MAX_MARGIN_METRES = 2000

/** Half the width of the Web Mercator world in metres. */
const HALF_WORLD = 20037508.342789244

export function toMercator([lng, lat]: Point): Point {
  return [(lng * HALF_WORLD) / 180, (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * HALF_WORLD) / Math.PI]
}

/** The tile's extent in Web Mercator metres (EPSG:3857), as WMS wants it. */
export function tileRect({ z, x, y }: Tile): Rect {
  const size = (2 * HALF_WORLD) / 2 ** z
  return { minX: -HALF_WORLD + x * size, maxX: -HALF_WORLD + (x + 1) * size, maxY: HALF_WORLD - y * size, minY: HALF_WORLD - (y + 1) * size }
}

/** The margin around the boundary at a zoom level, in metres on the ground. */
export function marginMetres(z: number, maxZoom = MAX_ZOOM): number {
  return Math.min(MAX_MARGIN_METRES, BASE_MARGIN_METRES * 2 ** (maxZoom - z))
}

/** MBTiles counts rows from the bottom (TMS), web maps from the top. */
export function tmsRow({ z, y }: Pick<Tile, 'z' | 'y'>): number {
  return 2 ** z - 1 - y
}

/** The outer rings of a Polygon or MultiPolygon (also inside a Feature). Holes are ignored: they are small and get downloaded too. */
export function outerRings(geojson: any): Point[][] {
  const g = geojson?.type === 'Feature' ? geojson.geometry : geojson
  if (g?.type === 'Polygon') return [g.coordinates[0]]
  if (g?.type === 'MultiPolygon') return g.coordinates.map((polygon: Point[][]) => polygon[0])
  if (g?.type === 'GeometryCollection') return g.geometries.flatMap(outerRings)
  return []
}

function pointInRing([x, y]: Point, ring: Point[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Liang–Barsky: whether the segment a–b passes through the rectangle. */
function segmentTouchesRect(a: Point, b: Point, r: Rect): boolean {
  let t0 = 0
  let t1 = 1
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const checks: [number, number][] = [[-dx, a[0] - r.minX], [dx, r.maxX - a[0]], [-dy, a[1] - r.minY], [dy, r.maxY - a[1]]]
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
  }
  return true
}

/** Whether a rectangle and a polygon ring overlap or touch. */
export function rectTouchesRing(rect: Rect, ring: Point[]): boolean {
  // The rectangle lies inside the polygon…
  if (pointInRing([rect.minX, rect.minY], ring)) return true
  // …or an edge of the polygon passes through it (this also covers a polygon inside the rectangle).
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (segmentTouchesRect(ring[j], ring[i], rect)) return true
  }
  return false
}

const grow = (r: Rect, by: number): Rect => ({ minX: r.minX - by, minY: r.minY - by, maxX: r.maxX + by, maxY: r.maxY + by })

/**
 * All tiles an offline map of this boundary needs, coarse zooms first.
 * `geojson` is the boundary in longitude/latitude.
 */
export function tilesForArea(geojson: unknown, minZoom = MIN_ZOOM, maxZoom = MAX_ZOOM): Tile[] {
  const rings = outerRings(geojson).filter((ring) => ring.length >= 3)
  if (rings.length === 0) return []
  const lats = rings.flat().map((p) => p[1])
  // Web Mercator stretches distances by 1 / cos(latitude).
  const stretch = 1 / Math.cos((((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI) / 180)
  const projected = rings.map((ring) => ring.map(toMercator))
  const xs = projected.flat().map((p) => p[0])
  const ys = projected.flat().map((p) => p[1])
  const box: Rect = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }

  const tiles: Tile[] = []
  for (let z = minZoom; z <= maxZoom; z++) {
    const margin = marginMetres(z, maxZoom) * stretch
    const size = (2 * HALF_WORLD) / 2 ** z
    const reach = grow(box, margin)
    const last = 2 ** z - 1
    const clamp = (n: number) => Math.max(0, Math.min(last, n))
    const x0 = clamp(Math.floor((reach.minX + HALF_WORLD) / size))
    const x1 = clamp(Math.floor((reach.maxX + HALF_WORLD) / size))
    const y0 = clamp(Math.floor((HALF_WORLD - reach.maxY) / size))
    const y1 = clamp(Math.floor((HALF_WORLD - reach.minY) / size))
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        // Growing the tile by the margin is the same as growing the boundary by it.
        const rect = grow(tileRect({ z, x, y }), margin)
        if (projected.some((ring) => rectTouchesRing(rect, ring))) tiles.push({ z, x, y })
      }
    }
  }
  return tiles
}

/** The area of the boundary in hectares (holes subtracted). Accurate to well under 1 % for areas of a few kilometres. */
export function areaHectares(geojson: any): number {
  const g = geojson?.type === 'Feature' ? geojson.geometry : geojson
  const polygons: Point[][][] = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : []
  let squareMetres = 0
  for (const polygon of polygons) {
    polygon.forEach((ring, index) => {
      const points = ring.map(toMercator)
      let twice = 0
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) twice += points[j][0] * points[i][1] - points[i][0] * points[j][1]
      const lat = ring.reduce((sum, p) => sum + p[1], 0) / ring.length
      const onGround = (Math.abs(twice) / 2) * Math.cos((lat * Math.PI) / 180) ** 2
      squareMetres += index === 0 ? onGround : -onGround
    })
  }
  return squareMetres / 10_000
}

/** `count` tiles of the most detailed zoom, spread evenly over the list: a fair sample for the size estimate. */
export function sampleTiles(tiles: Tile[], count: number): Tile[] {
  const top = Math.max(...tiles.map((t) => t.z))
  const detailed = tiles.filter((t) => t.z === top)
  if (detailed.length <= count) return detailed
  return Array.from({ length: count }, (_, i) => detailed[Math.floor(((i + 0.5) * detailed.length) / count)])
}
