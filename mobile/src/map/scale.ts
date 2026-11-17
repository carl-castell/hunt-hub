const EARTH_CIRCUMFERENCE = 40075016.686

/** Metres per screen point at a latitude and MapLibre zoom level (512-point tiles). */
export function metresPerPoint(lat: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom)
}

/** The largest round distance (1, 2 or 5 × 10ⁿ m) that is not more than `maxMetres`. */
export function roundDistance(maxMetres: number): number {
  const pow = 10 ** Math.floor(Math.log10(maxMetres))
  const d = maxMetres / pow
  return (d >= 5 ? 5 : d >= 2 ? 2 : 1) * pow
}

export function formatDistance(metres: number): string {
  return metres >= 1000 ? `${+(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`
}

export type Ring = { radius: number; label: string }

/**
 * Distance rings around the map centre: evenly spaced by a round distance,
 * at least `count` rings within `maxRadius` points.
 */
export function distanceRings(lat: number, zoom: number, maxRadius: number, count = 3): Ring[] {
  const mpp = metresPerPoint(lat, zoom)
  const step = roundDistance((maxRadius * mpp) / count)
  const rings: Ring[] = []
  for (let k = 1; (k * step) / mpp <= maxRadius; k++) {
    rings.push({ radius: (k * step) / mpp, label: formatDistance(k * step) })
  }
  return rings
}
