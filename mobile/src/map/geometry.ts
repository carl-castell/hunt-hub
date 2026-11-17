type Ring = number[][]

/** Ray casting: whether a point lies inside a closed ring. */
function inRing([x, y]: [number, number], ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Inside the polygon's outer ring and in none of its holes. */
function inPolygon(point: [number, number], rings: Ring[]): boolean {
  return rings.length > 0 && inRing(point, rings[0]) && !rings.slice(1).some((hole) => inRing(point, hole))
}

/**
 * Whether a point lies inside an area boundary (Polygon or MultiPolygon, also
 * wrapped in a Feature). A missing boundary counts as "inside": there is nothing
 * to warn about.
 */
export function insideBoundary(point: [number, number], geojson: any): boolean {
  if (!geojson) return true
  const g = geojson.type === 'Feature' ? geojson.geometry : geojson
  if (g?.type === 'Polygon') return inPolygon(point, g.coordinates)
  if (g?.type === 'MultiPolygon') return g.coordinates.some((poly: Ring[]) => inPolygon(point, poly))
  return true
}
