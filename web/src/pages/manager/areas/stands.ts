import type { StandStatus } from '@hunt-hub/backend/src/shared/standStatus'

export type ApiStand = {
  id: number
  number: string
  location: GeoJSON.Geometry | null
  nickname: string | null
  status: StandStatus | null
  /** YYYY-MM-DD */
  statusDate: string | null
}

/** Display text per status code, in one place for the later translation. */
export const STAND_STATUS_LABELS: Record<StandStatus, string> = {
  ok: 'OK',
  needs_repair: 'Needs repair',
  broken: 'Broken',
  removed: 'Removed',
}

/** "Stand 12 · Eiche", or "Stand 12" without a nickname. */
export function standTitle(stand: { number: string; nickname: string | null }): string {
  return stand.nickname ? `Stand ${stand.number} · ${stand.nickname}` : `Stand ${stand.number}`
}

/** A YYYY-MM-DD date in the reader's language, e.g. "17 Nov 2026". */
export function formatStatusDate(date: string, locale?: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Today in the browser's time zone as YYYY-MM-DD. */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Stands in natural number order (2 before 10), filtered by a search for their number or nickname. */
export function searchStands<T extends { number: string; nickname?: string | null }>(stands: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  return stands
    .filter((s) => s.number.toLowerCase().includes(q) || (s.nickname ?? '').toLowerCase().includes(q))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
}

/** The position of a stand, if it has a point. */
export function standPosition(stand: Pick<ApiStand, 'location'>): [number, number] | null {
  return stand.location?.type === 'Point' ? (stand.location.coordinates as [number, number]) : null
}
