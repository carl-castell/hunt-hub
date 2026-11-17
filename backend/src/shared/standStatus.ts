/**
 * The condition of a stand, shared by the backend, the React app and (as a
 * copy of the codes) the iPhone app. The codes are stored; the clients turn
 * them into display text, so they can be translated later.
 *
 * A stand without a status has not been checked yet. The status date is the
 * day the status last changed.
 *
 * Keep this file free of imports: the React app bundles it.
 */
export const STAND_STATUSES = ['ok', 'needs_repair', 'broken', 'removed'] as const

export type StandStatus = (typeof STAND_STATUSES)[number]

export const STAND_NICKNAME_MAX = 64

export function isStandStatus(value: unknown): value is StandStatus {
  return typeof value === 'string' && (STAND_STATUSES as readonly string[]).includes(value)
}

/**
 * The status date after a change:
 * - no status → no date
 * - a date given → that date
 * - the status changed → today
 * - otherwise the date stays as it was
 */
export function resolveStatusDate(
  previousStatus: StandStatus | null,
  previousDate: string | null,
  nextStatus: StandStatus | null,
  givenDate: string | undefined,
  today: string,
): string | null {
  if (nextStatus === null) return null
  if (givenDate) return givenDate
  if (nextStatus !== previousStatus) return today
  return previousDate
}
