import type { BBox } from './bbox'

export type StandRow = { id: number; number: string; lng: number | null; lat: number | null }
export type StandMarker = { id: number; number: string; lngLat: [number, number] }

/** Stands that can be drawn on the map: only those with a position, in natural number order (2 before 10). */
export function standMarkers(rows: StandRow[]): StandMarker[] {
  return rows
    .filter((s): s is StandRow & { lng: number; lat: number } => s.lng != null && s.lat != null)
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
    .map((s) => ({ id: s.id, number: s.number, lngLat: [s.lng, s.lat] }))
}

/** Bounding box around the stands; null when there are none. */
export function standsBBox(markers: StandMarker[]): BBox | null {
  if (markers.length === 0) return null
  const lngs = markers.map((m) => m.lngLat[0])
  const lats = markers.map((m) => m.lngLat[1])
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)]
}

/** Stands in natural number order, filtered by a search for their number. */
export function searchStands<T extends { number: string }>(stands: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  return stands
    .filter((s) => s.number.toLowerCase().includes(q))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
}

/** A Google Maps link to a point; opens the app or the website on any device. */
export function googleMapsUrl(lng: number, lat: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`
}

/** How a stand marker looks: its circle size and the number's font size (null: just a dot). */
export type StandMarkerStyle = { size: number; fontSize: number | null }

/**
 * Stand markers by zoom level, in steps: zoomed in, a circle with the number;
 * zoomed out, an ever smaller dot, so many stands don't clutter the map.
 * Steps instead of a smooth scale, so markers only redraw when a step changes.
 */
export function standMarkerStyle(zoom: number): StandMarkerStyle {
  if (zoom >= 14.5) return { size: 26, fontSize: 10 }
  if (zoom >= 13.5) return { size: 20, fontSize: 8 }
  if (zoom >= 12.5) return { size: 10, fontSize: null }
  return { size: 6, fontSize: null }
}
