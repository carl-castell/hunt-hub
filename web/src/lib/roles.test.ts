import { describe, it, expect } from 'vitest'
import { homeForRole } from './roles'

describe('homeForRole', () => {
  it('sends admins to the admin area', () => {
    expect(homeForRole('admin')).toBe('/admin')
  })

  it('sends managers to the manager area', () => {
    expect(homeForRole('manager')).toBe('/manager')
  })

  it.each(['staff', 'guest'] as const)('sends %s back to the login page (no web area)', (role) => {
    expect(homeForRole(role)).toBe('/login')
  })

  it('sends logged-out users to the login page', () => {
    expect(homeForRole(null)).toBe('/login')
    expect(homeForRole(undefined)).toBe('/login')
  })
})
