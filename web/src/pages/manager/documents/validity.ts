/** "1 year, 3 months", "12 days": the time between two YYYY-MM-DD dates, roughly, for reading. */
export function spanText(from: string, to: string): string {
  const a = new Date(`${from}T12:00:00`)
  const b = new Date(`${to}T12:00:00`)
  const days = Math.round(Math.abs(b.getTime() - a.getTime()) / 86_400_000)
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  const rest = days % 365 % 30
  const parts: string[] = []
  if (years) parts.push(years === 1 ? '1 year' : `${years} years`)
  if (months) parts.push(months === 1 ? '1 month' : `${months} months`)
  if (!years && !months) parts.push(rest === 1 ? '1 day' : `${rest} days`)
  return parts.join(', ')
}

/** "Valid for 1 year, 3 months" / "Expired 12 days ago" / "Expires today". */
export function validityText(expiryDate: string, today: string): string {
  if (expiryDate === today) return 'Expires today'
  return expiryDate > today ? `Valid for ${spanText(today, expiryDate)}` : `Expired ${spanText(expiryDate, today)} ago`
}

/** Reasons a manager rejects a document most often; the guest reads them in the email. */
export const REJECTION_REASONS = [
  'The photo is not readable. Please take a sharper picture of the whole document.',
  'The document belongs to someone else.',
  'The document has expired.',
  'Some pages are missing.',
] as const
