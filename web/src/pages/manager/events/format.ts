import { DAY_MINUTES, formatDuration, minutesOf, timeOf } from '@hunt-hub/backend/src/shared/driveTimes'

/** "Sat 5 Dec 2026" in the reader's language. */
export function formatEventDate(date: string, locale?: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

/** "Saturday, 5 December 2026". */
export function formatEventDateLong(date: string, locale?: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/** Today in the browser as YYYY-MM-DD. */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Start times every 15 minutes over the whole day. */
export function startTimes(): string[] {
  return Array.from({ length: DAY_MINUTES / 15 }, (_, i) => timeOf(i * 15))
}

/**
 * Start times for a new drive: from `first` (the next full hour after the
 * previous drive) to the end of the day, then the earlier ones, so the list
 * opens where the new drive most likely starts.
 */
export function startTimesFrom(first: string): string[] {
  const all = startTimes()
  const index = Math.max(0, all.indexOf(first))
  return [...all.slice(index), ...all.slice(0, index)]
}

/** Durations in 30-minute steps that still end before midnight, from a start time (current value kept). */
export function durationsFor(start: string, current?: number): number[] {
  const left = DAY_MINUTES - minutesOf(start)
  const steps = Array.from({ length: 24 }, (_, i) => (i + 1) * 30).filter((m) => m <= left)
  if (current && !steps.includes(current) && current <= left) steps.push(current)
  return steps.sort((a, b) => a - b)
}

export { formatDuration }
