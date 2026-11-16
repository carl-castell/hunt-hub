import { useEffect } from 'react'

/**
 * Leaves the React app for a page that is still server-rendered (full page
 * load). Used where a React route stands in for an old page, e.g. the
 * manager dashboard.
 */
export function LegacyRedirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to)
  }, [to])
  return null
}
