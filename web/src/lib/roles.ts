export type Role = SessionUser['role']

/** Roles that have their own area in the web app. */
export type WebRole = Extract<Role, 'admin' | 'manager'>

const HOME_BY_ROLE: Record<WebRole, string> = {
  admin: '/admin',
  manager: '/manager',
}

/**
 * Where a user of this role lands after login. Staff and guests have no web
 * area (staff use the iPhone app, guests the RSVP link), so they go back to
 * the login page.
 */
export function homeForRole(role: Role | undefined | null): string {
  return role && role in HOME_BY_ROLE ? HOME_BY_ROLE[role as WebRole] : '/login'
}
