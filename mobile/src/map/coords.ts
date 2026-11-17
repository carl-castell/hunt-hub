export type CoordinateFormat = 'decimal' | 'utm'

export type Utm = { zone: number; band: string; easting: number; northing: number }

const BANDS = 'CDEFGHJKLMNPQRSTUVWXX'

/** UTM zone, including the Norway and Svalbard exceptions. */
function utmZone(lat: number, lng: number): number {
  if (lat >= 56 && lat < 64 && lng >= 3 && lng < 12) return 32
  if (lat >= 72 && lat < 84) {
    if (lng >= 0 && lng < 9) return 31
    if (lng >= 9 && lng < 21) return 33
    if (lng >= 21 && lng < 33) return 35
    if (lng >= 33 && lng < 42) return 37
  }
  return Math.floor((lng + 180) / 6) + 1
}

/** WGS84 latitude/longitude to UTM (Snyder's formulas, accurate to well below a metre). Null outside 80°S–84°N. */
export function toUtm(lat: number, lng: number): Utm | null {
  if (lat < -80 || lat > 84) return null
  const a = 6378137
  const f = 1 / 298.257223563
  const k0 = 0.9996
  const e2 = f * (2 - f)
  const ep2 = e2 / (1 - e2)

  const zone = utmZone(lat, lng)
  const lng0 = (zone - 1) * 6 - 180 + 3
  const phi = (lat * Math.PI) / 180
  const dLambda = ((lng - lng0) * Math.PI) / 180

  const sin = Math.sin(phi)
  const cos = Math.cos(phi)
  const tan = Math.tan(phi)
  const N = a / Math.sqrt(1 - e2 * sin * sin)
  const T = tan * tan
  const C = ep2 * cos * cos
  const A = cos * dLambda
  const e4 = e2 * e2
  const e6 = e4 * e2
  const M = a * (
    (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi
    - ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi)
    + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi)
    - ((35 * e6) / 3072) * Math.sin(6 * phi)
  )

  const easting = k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000
  let northing = k0 * (M + N * tan * (A ** 2 / 2 + ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24
    + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720))
  if (lat < 0) northing += 10000000

  return { zone, band: BANDS[Math.floor((lat + 80) / 8)], easting, northing }
}

/** "51.12345, 10.12345" (latitude, longitude) or "32U 512345 5664321". */
export function formatCoordinate(lng: number, lat: number, format: CoordinateFormat): string {
  if (format === 'utm') {
    const u = toUtm(lat, lng)
    if (u) return `${u.zone}${u.band} ${Math.round(u.easting)} ${Math.round(u.northing)}`
  }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

/** GPS accuracy (radius in metres) as "GPS ± 5 m". */
export function formatAccuracy(metres: number): string {
  return `GPS ± ${Math.max(1, Math.round(metres))} m`
}
