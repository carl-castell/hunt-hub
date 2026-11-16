export type LngLat = [number, number]
export type Bounds = [LngLat, LngLat]

/** The positions of the GeoJSON geometries this app uses (points and polygons). */
function positionsOf(geometry: GeoJSON.Geometry): GeoJSON.Position[] {
  switch (geometry.type) {
    case 'Point': return [geometry.coordinates]
    case 'MultiPoint':
    case 'LineString': return geometry.coordinates
    case 'MultiLineString':
    case 'Polygon': return geometry.coordinates.flat()
    case 'MultiPolygon': return geometry.coordinates.flat(2)
    case 'GeometryCollection': return geometry.geometries.flatMap(positionsOf)
  }
}

/**
 * The smallest box around all given geometries, as [southWest, northEast],
 * or null if there is nothing to show. Used to zoom the map to an area.
 */
export function boundsOf(geometries: Array<GeoJSON.Geometry | null>): Bounds | null {
  const positions = geometries.flatMap((g) => (g ? positionsOf(g) : []))
  if (positions.length === 0) return null

  const lngs = positions.map((p) => p[0])
  const lats = positions.map((p) => p[1])
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ]
}
