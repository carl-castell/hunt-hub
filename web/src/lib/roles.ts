export type Role = SessionUser['role']

/** Roles that have their own area in the web app. */
export type WebRole = Extract<Role, 'admin' | 'manager'>

const HOME_BY_ROLE: Record<WebRole, string> = {
  admin: '/admin',
  manager: '/manager',
}

/** Whether this role has its own area in the web app. */
export function hasWebArea(role: Role | undefined | null): role is WebRole {
  return !!role && role in HOME_BY_ROLE
}

/**
 * Where a user of this role lands after login. Staff and guests have no web
 * area (staff use the iPhone app, guests the RSVP link), so they go back to
 * the login page.
 */
export function homeForRole(role: Role | undefined | null): string {
  return hasWebArea(role) ? HOME_BY_ROLE[role] : '/login'
}
