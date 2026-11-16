import { MANAGER_NAV } from '@hunt-hub/backend/src/shared/managerNav'
import { AppLayout, type NavItem } from '@/components/layout/AppLayout'
import { trpc } from '@/lib/trpc'

/**
 * Same menu as the server-rendered manager pages. Entries that live in the
 * React app are router links; the others open the old page.
 */
const MANAGER_NAV_ITEMS: NavItem[] = MANAGER_NAV.map((entry) =>
  entry.inReactApp
    ? { label: entry.label, to: entry.path }
    : { label: entry.label, href: entry.path },
)

export function ManagerLayout() {
  const { data: estate } = trpc.manager.estate.get.useQuery()
  return <AppLayout navItems={MANAGER_NAV_ITEMS} subtitle={estate?.name ?? 'Manager'} />
}
