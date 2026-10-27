import { createTRPCClient, httpLink } from '@trpc/client'
import type { AppRouter } from '@hunt-hub/backend/src/trpc/router'
import { TRPC_URL } from '../config'
import { clearSession, loadSession, saveSession, saveUser, type StoredSession, type User } from '../auth/storage'

/** The refresh token was refused: the user must log in again (local data is kept). */
export class SessionExpiredError extends Error {
  constructor() { super('Session expired') }
}

const REFRESH_MARGIN_MS = 60_000

let session: StoredSession | null = null
let sessionLoaded = false
let refreshing: Promise<StoredSession> | null = null
let onExpired: () => void = () => {}

export function setOnSessionExpired(cb: () => void) { onExpired = cb }

export async function getSession() {
  if (!sessionLoaded) { session = await loadSession(); sessionLoaded = true }
  return session
}

export async function setSession(next: StoredSession | null) {
  session = next
  sessionLoaded = true
  if (next) await saveSession(next)
  else await clearSession()
}

async function refreshSession(): Promise<StoredSession> {
  const current = await getSession()
  if (!current) throw new SessionExpiredError()

  const res = await fetch(`${TRPC_URL}/mobile.auth.refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: current.refreshToken }),
  })
  if (res.status === 401) {
    await setSession(null)
    onExpired()
    throw new SessionExpiredError()
  }
  if (!res.ok) throw new Error(`Refresh failed (${res.status})`)

  const data = (await res.json()).result.data as StoredSession & { user: User }
  const next = { accessToken: data.accessToken, refreshToken: data.refreshToken, accessExpiresAt: data.accessExpiresAt }
  await setSession(next)
  await saveUser(data.user)
  return next
}

/** Only one refresh at a time; parallel requests wait for it. */
function refreshOnce() {
  if (!refreshing) refreshing = refreshSession().finally(() => { refreshing = null })
  return refreshing
}

/** fetch with the Bearer token; refreshes before expiry and once after a 401. */
async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input)
  const isAuthCall = url.includes('/mobile.auth.login') || url.includes('/mobile.auth.refresh')

  let current = isAuthCall ? null : await getSession()
  if (current && new Date(current.accessExpiresAt).getTime() - Date.now() < REFRESH_MARGIN_MS) {
    current = await refreshOnce()
  }

  const withToken = (s: StoredSession | null): RequestInit => ({
    ...init,
    headers: { ...(init?.headers as Record<string, string>), ...(s ? { Authorization: `Bearer ${s.accessToken}` } : {}) },
  })

  const res = await fetch(input, withToken(current))
  if (res.status !== 401 || isAuthCall || !current) return res

  return fetch(input, withToken(await refreshOnce()))
}

export const api = createTRPCClient<AppRouter>({
  links: [httpLink({ url: TRPC_URL, fetch: authFetch })],
})
