import * as SecureStore from 'expo-secure-store'

export type StoredSession = {
  accessToken: string
  refreshToken: string
  accessExpiresAt: string
}

export type User = {
  id: number
  firstName: string
  lastName: string
  email: string
  role: 'admin' | 'manager' | 'staff' | 'guest'
  estateId: number | null
  active: boolean
}

const SESSION_KEY = 'hunthub.session'
const USER_KEY = 'hunthub.user'

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await SecureStore.getItemAsync(key)
  if (!raw) return null
  try { return JSON.parse(raw) as T } catch { return null }
}

export const loadSession = () => readJson<StoredSession>(SESSION_KEY)
export const loadUser = () => readJson<User>(USER_KEY)

export async function saveSession(session: StoredSession) {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session))
}

export async function saveUser(user: User) {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user))
}

/** Drops the tokens but keeps the cached user, so the app can ask to log in again offline-safe. */
export async function clearSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY)
}

export async function clearUser() {
  await SecureStore.deleteItemAsync(USER_KEY)
}
