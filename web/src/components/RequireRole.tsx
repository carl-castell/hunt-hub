import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { homeForRole, type WebRole } from '@/lib/roles'

/**
 * Only renders its children for a logged-in user with the given role.
 * Others are sent to the login page or to their own home page. This is for
 * navigation only: the server checks the role again on every API call.
 */
export function RequireRole({ role, children }: { role: WebRole; children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to={homeForRole(user.role)} replace />
  return <>{children}</>
}
