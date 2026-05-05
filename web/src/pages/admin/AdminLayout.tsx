import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2 rounded-md text-sm transition-colors ${
    isActive
      ? 'bg-muted text-foreground'
      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
  }`

export function AdminLayout() {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-56 border-r border-border flex flex-col shrink-0">
        <div className="p-6 border-b border-border">
          <p className="font-semibold text-sm">Hunt Hub</p>
          <p className="text-xs text-muted-foreground mt-0.5 capitalize">{user?.role}</p>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          <NavLink to="/admin" end className={navClass}>Dashboard</NavLink>
          <NavLink to="/admin/audit" className={navClass}>Audit</NavLink>
          <NavLink to="/admin/settings" className={navClass}>Settings</NavLink>
          <NavLink to="/admin/account" className={navClass}>Account</NavLink>
        </nav>

        <div className="p-3 border-t border-border">
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
    </div>
  )
}
