/** One moment of a download: when, and how many tiles were done by then. */
export type RateSample = { at: number; done: number }

/** Only the recent past counts, so the estimate follows a connection that got faster or slower. */
export const RATE_WINDOW_MS = 30_000

export function addSample(samples: RateSample[], sample: RateSample): RateSample[] {
  return [...samples.filter((s) => sample.at - s.at <= RATE_WINDOW_MS), sample]
}

/** Seconds until the download is finished, or null while there is too little to go by. */
export function secondsLeft(samples: RateSample[], remaining: number): number | null {
  if (remaining <= 0) return 0
  if (samples.length < 2) return null
  const first = samples[0]
  const last = samples[samples.length - 1]
  const tiles = last.done - first.done
  const ms = last.at - first.at
  if (tiles <= 0 || ms < 2000) return null
  return Math.ceil((remaining * ms) / tiles / 1000)
}

/** "about 40 seconds", "about 3 minutes", "about 1 hour 20 minutes". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `about ${Math.max(5, Math.round(seconds / 5) * 5)} seconds`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `about ${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `about ${hours} hour${hours === 1 ? '' : 's'}${rest ? ` ${rest} minute${rest === 1 ? '' : 's'}` : ''}`
}

/** Storage in MB with one decimal ("12.4 MB"), or KB below 1 MB. */
export function formatBytes(bytes: number, locale?: string): string {
  if (bytes < 1_000_000) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(bytes / 1000)} KB`
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bytes / 1_000_000)} MB`
}
