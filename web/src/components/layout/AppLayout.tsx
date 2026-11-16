import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Toaster } from '@/components/ui/sonner'

/**
 * A menu entry is either a page of this React app (`to`) or a page that is
 * still server-rendered (`href`, opened with a full page load). Both share
 * the same login session. Migrating a page means turning its `href` into `to`.
 */
export type NavItem =
  | { label: string; to: string; end?: boolean }
  | { label: string; href: string }

const itemClass = 'block px-3 py-2 rounded-md text-sm transition-colors'
const inactiveClass = 'text-muted-foreground hover:text-foreground hover:bg-muted/50'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `${itemClass} ${isActive ? 'bg-muted text-foreground' : inactiveClass}`

function NavEntry({ item }: { item: NavItem }) {
  if ('href' in item) {
    return <a href={item.href} className={`${itemClass} ${inactiveClass}`}>{item.label}</a>
  }
  return <NavLink to={item.to} end={item.end} className={navClass}>{item.label}</NavLink>
}

type AppLayoutProps = {
  navItems: NavItem[]
  /** Shown under the app name, e.g. the role or the estate name. */
  subtitle?: string
}

export function AppLayout({ navItems, subtitle }: AppLayoutProps) {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-56 border-r border-border flex flex-col shrink-0">
        <div className="p-6 border-b border-border">
          <p className="font-semibold text-sm">Hunt Hub</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item) => <NavEntry key={item.label} item={item} />)}
        </nav>

        <div className="p-3 border-t border-border space-y-1">
          <p className="px-3 text-xs text-muted-foreground truncate">{user?.firstName} {user?.lastName}</p>
          <button
            onClick={logout}
            className="w-full px-3 py-2 text-sm text-left text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto">
        <Outlet />
      </main>
      <Toaster />
    </div>
  )
}
