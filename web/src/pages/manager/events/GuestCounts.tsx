/** The guests' answers at a glance: "✓ 12 · ✕ 3 · ○ 6 · 2 not sent". */
export function GuestCounts({ guests, className = '' }: {
  guests: { invited: number; yes: number; no: number; open: number; notSent: number }
  className?: string
}) {
  if (guests.invited === 0) return <span className={`text-muted-foreground ${className}`}>No guests invited yet</span>
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums ${className}`}>
      <span title="Coming" className="text-green-700 dark:text-green-400">✓ {guests.yes}</span>
      <span title="Not coming" className="text-red-700 dark:text-red-400">✕ {guests.no}</span>
      <span title="No answer yet" className="text-muted-foreground">○ {guests.open}</span>
      {guests.notSent > 0 && <span className="text-amber-700 dark:text-amber-400">{guests.notSent} not sent</span>}
    </span>
  )
}
