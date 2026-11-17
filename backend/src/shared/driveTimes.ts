/**
 * Times of drives (Treiben), shared by the backend and the React app.
 * Times are "HH:MM" on the hunt day; drives don't run past midnight.
 *
 * Keep this file free of imports: the React app bundles it.
 */

export const DEFAULT_FIRST_DRIVE_START = '09:00'
export const DEFAULT_DRIVE_MINUTES = 120
export const MIN_DRIVE_MINUTES = 15
export const DAY_MINUTES = 24 * 60

/** "09:30" or "09:30:00" → 570. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** 570 → "09:30". */
export function timeOf(minutes: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

/** The time a drive ends. */
export function endOf(start: string, durationMinutes: number): string {
  return timeOf(minutesOf(start) + durationMinutes)
}

export function durationBetween(start: string, end: string): number {
  return minutesOf(end) - minutesOf(start)
}

/** Where the time picker of a new drive starts: the next full hour after the previous drive ends. */
export function nextFullHourAfter(end: string): string {
  const minutes = minutesOf(end)
  return timeOf(Math.min(DAY_MINUTES - 60, Math.ceil((minutes + 1) / 60) * 60))
}

/** Whether a drive with this start and duration ends on the same day. */
export function fitsInDay(start: string, durationMinutes: number): boolean {
  return durationMinutes >= MIN_DRIVE_MINUTES && minutesOf(start) + durationMinutes <= DAY_MINUTES
}

/** "2 h", "2.5 h", "45 min": the length of a drive in hours. */
export function formatDuration(minutes: number, locale?: string): string {
  if (minutes < 60) return `${minutes} min`
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(minutes / 60)} h`
}

/** The next free "Drive <n>" name. */
export function nextDriveName(existing: string[]): string {
  const numbers = existing.map((name) => /^Drive (\d+)$/.exec(name)?.[1]).filter(Boolean).map(Number)
  return `Drive ${Math.max(existing.length, ...numbers) + 1}`
}
