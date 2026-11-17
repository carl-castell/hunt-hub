import type { StandStatus } from '@hunt-hub/backend/src/shared/standStatus'

export type { StandStatus }

/**
 * The stand statuses as stored by the server. A copy of the codes (the app
 * doesn't bundle backend code); the `StandStatus` type from the backend makes
 * the type check fail if the two lists drift apart.
 */
export const STAND_STATUSES: readonly StandStatus[] = ['ok', 'needs_repair', 'broken', 'removed']

/** Display text per status code, in one place for the later translation. */
export const STAND_STATUS_LABELS: Record<StandStatus, string> = {
  ok: 'OK',
  needs_repair: 'Needs repair',
  broken: 'Broken',
  removed: 'Removed',
}

/** Green = usable, amber = needs work, red = not usable, grey = gone. */
export const STAND_STATUS_COLORS: Record<StandStatus, string> = {
  ok: '#16a34a',
  needs_repair: '#f59e0b',
  broken: '#dc2626',
  removed: '#a1a1aa',
}

export function isStandStatus(value: unknown): value is StandStatus {
  return typeof value === 'string' && (STAND_STATUSES as readonly string[]).includes(value)
}

/** "Stand 12 · Eiche", or "Stand 12" without a nickname. */
export function standTitle(stand: { number: string; nickname?: string | null }): string {
  return stand.nickname ? `Stand ${stand.number} · ${stand.nickname}` : `Stand ${stand.number}`
}

/** A YYYY-MM-DD date in the phone's language, e.g. "17 Nov 2026". */
export function formatStatusDate(date: string, locale?: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "Broken · since 17 Nov 2026"; null without a status. */
export function statusText(status: string | null | undefined, date: string | null | undefined, locale?: string): string | null {
  if (!isStandStatus(status)) return null
  return date ? `${STAND_STATUS_LABELS[status]} · since ${formatStatusDate(date, locale)}` : STAND_STATUS_LABELS[status]
}

/** Today on this phone as YYYY-MM-DD (the day the change was made, also offline). */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
