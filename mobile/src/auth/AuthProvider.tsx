import * as Device from 'expo-device'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, setOnSessionExpired, setSession, getSession } from '../api/client'
import { getDb } from '../db/database'
import { wipeUserData } from '../db/localData'
import { clearUser, loadUser, saveUser, type User } from './storage'

/**
 * - signedIn: tokens on the device. Works fully offline.
 * - expired:  the server refused the refresh token. Local data and queued changes are kept;
 *             the user logs in again and sync continues.
 */
type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'expired'

type AuthContextValue = {
  status: AuthStatus
  user: User | null
  login(email: string, password: string): Promise<void>
  logout(): Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    setOnSessionExpired(() => setStatus('expired'))
    ;(async () => {
      const [cachedUser, session] = await Promise.all([loadUser(), getSession()])
      setUser(cachedUser)
      setStatus(cachedUser && session ? 'signedIn' : cachedUser ? 'expired' : 'signedOut')
    })()
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.mobile.auth.login.mutate({
      email, password, deviceName: Device.deviceName ?? Device.modelName ?? undefined,
    })
    const previous = await loadUser()
    // Another person on this phone: don't mix their offline data with the new user's.
    if (previous && previous.id !== res.user.id) wipeUserData(getDb())

    await setSession({ accessToken: res.accessToken, refreshToken: res.refreshToken, accessExpiresAt: res.accessExpiresAt })
    await saveUser(res.user)
    setUser(res.user)
    setStatus('signedIn')
  }, [])

  const logout = useCallback(async () => {
    // Best effort: revoke the session on the server, but never block logging out while offline.
    await Promise.race([
      api.mobile.auth.logout.mutate().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ])
    await setSession(null)
    await clearUser()
    wipeUserData(getDb())
    setUser(null)
    setStatus('signedOut')
  }, [])

  const value = useMemo(() => ({ status, user, login, logout }), [status, user, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
