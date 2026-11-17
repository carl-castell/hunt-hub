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
