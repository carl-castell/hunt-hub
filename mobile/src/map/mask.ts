// Same as web/src/components/map/mask.ts (the website's inverted boundary).
/** A ring around the whole map (Web Mercator stops at about ±85° latitude). */
const WORLD_RING: GeoJSON.Position[] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]

/** Twice the signed area of a ring: positive when counter-clockwise, negative when clockwise. */
function signedArea(ring: GeoJSON.Position[]): number {
  let sum = 0
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return sum
}

/**
 * MapLibre decides by winding direction whether a ring is a hole or a shape
 * of its own. The world ring runs counter-clockwise, so holes must run
 * clockwise, whatever direction the uploaded file used.
 */
function asHole(ring: GeoJSON.Position[]): GeoJSON.Position[] {
  return signedArea(ring) > 0 ? [...ring].reverse() : ring
}

/** The outer rings of all polygons in a geometry. */
function outerRingsOf(geometry: GeoJSON.Geometry): GeoJSON.Position[][] {
  switch (geometry.type) {
    case 'Polygon': return geometry.coordinates.slice(0, 1)
    case 'MultiPolygon': return geometry.coordinates.map((polygon) => polygon[0])
    case 'GeometryCollection': return geometry.geometries.flatMap(outerRingsOf)
    default: return []
  }
}

/**
 * The inverse of a boundary: a polygon covering the whole world with the
 * boundary cut out as holes. Filling it shades everything outside the area.
 * Returns null if the geometry has no polygons.
 */
export function maskOutside(boundary: GeoJSON.Geometry): GeoJSON.Polygon | null {
  const holes = outerRingsOf(boundary)
  if (holes.length === 0) return null
  return { type: 'Polygon', coordinates: [WORLD_RING, ...holes.map(asHole)] }
}
