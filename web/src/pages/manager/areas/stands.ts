export type ApiStand = { id: number; number: string; location: GeoJSON.Geometry | null }

/** Stands in natural number order (2 before 10), filtered by a search for their number. */
export function searchStands<T extends { number: string }>(stands: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  return stands
    .filter((s) => s.number.toLowerCase().includes(q))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
}

/** The position of a stand, if it has a point. */
export function standPosition(stand: ApiStand): [number, number] | null {
  return stand.location?.type === 'Point' ? (stand.location.coordinates as [number, number]) : null
}
