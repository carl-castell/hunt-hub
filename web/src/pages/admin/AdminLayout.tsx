import { AppLayout, type NavItem } from '@/components/layout/AppLayout'

const ADMIN_NAV: NavItem[] = [
  { label: 'Dashboard', to: '/admin', end: true },
  { label: 'Audit', to: '/admin/audit' },
  { label: 'Settings', to: '/admin/settings' },
  { label: 'Account', to: '/admin/account' },
]

export function AdminLayout() {
  return <AppLayout navItems={ADMIN_NAV} subtitle="Admin" />
}
