/**
 * The manager menu, shared by the server-rendered pages (EJS layout) and the
 * React app, so both always show the same entries.
 *
 * Every entry is a page path. Entries with `inReactApp: true` live in the
 * React app (served under /app); all others are still server-rendered.
 * Moving a page to React = build it there, then set `inReactApp: true`.
 *
 * Keep this file free of imports: the React app bundles it.
 */
export type ManagerNavEntry = {
  label: string
  path: string
  inReactApp?: boolean
}

export const MANAGER_NAV: readonly ManagerNavEntry[] = [
  { label: 'Dashboard', path: '/manager' },
  { label: 'Estate', path: '/manager/estate' },
  { label: 'Areas', path: '/manager/areas', inReactApp: true },
  { label: 'Guests', path: '/manager/guests' },
  { label: 'Guest groups', path: '/manager/guest-groups' },
  { label: 'Events', path: '/manager/events', inReactApp: true },
  { label: 'People', path: '/manager/people' },
  { label: 'Account', path: '/manager/account' },
]

export const REACT_APP_BASE_PATH = '/app'

/** The URL to open a menu entry from a server-rendered page. */
export function managerNavHref(entry: ManagerNavEntry): string {
  return entry.inReactApp ? `${REACT_APP_BASE_PATH}${entry.path}` : entry.path
}
