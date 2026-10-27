import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from 'expo-network'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import { api, SessionExpiredError } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import { SYNC_INTERVAL_MS } from '../config'
import { getDb } from '../db/database'
import { useQuery } from '../db/useQuery'
import { createSyncEngine } from './engine'
import { createSqliteSyncStore, getState, LAST_SYNC_KEY } from './sqliteStore'

type SyncStatus = {
  online: boolean
  syncing: boolean
  lastSyncAt: string | null
  lastError: string | null
  pending: number
  rejected: number
  /** Runs a sync now. Resolves when it is done; never throws. */
  syncNow(): Promise<void>
}

const SyncContext = createContext<SyncStatus | null>(null)

const isOnline = (s: NetworkState) => Boolean(s.isConnected && s.isInternetReachable !== false)

export function SyncProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const signedIn = status === 'signedIn'
  const db = getDb()

  const engine = useMemo(() => createSyncEngine(
    {
      pull: (cursor) => api.mobile.sync.pull.query({ cursor }),
      push: (mutations) => api.mobile.sync.push.mutate({ mutations }),
    },
    createSqliteSyncStore(db),
  ), [db])

  const [online, setOnline] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const onlineRef = useRef(false)

  const counts = useQuery(
    () => db.getFirstSync<{ pending: number; rejected: number }>(
      `SELECT COALESCE(SUM(status = 'pending'), 0) AS pending, COALESCE(SUM(status = 'rejected'), 0) AS rejected FROM outbox`,
    ) ?? { pending: 0, rejected: 0 },
    ['outbox'],
  )
  const lastSyncAt = useQuery(() => getState(db, LAST_SYNC_KEY), ['sync_state'])

  const syncNow = useCallback(async () => {
    if (!signedIn || !onlineRef.current) return
    setSyncing(true)
    try {
      await engine.run()
      setLastError(null)
    } catch (err) {
      // An expired session is handled by AuthProvider (shows the login screen).
      if (!(err instanceof SessionExpiredError)) setLastError(err instanceof Error ? err.message : String(err))
    } finally {
      setSyncing(engine.isRunning)
    }
  }, [engine, signedIn])

  // Network: sync whenever the connection comes back.
  useEffect(() => {
    const update = (s: NetworkState) => {
      const next = isOnline(s)
      const cameBack = next && !onlineRef.current
      onlineRef.current = next
      setOnline(next)
      if (cameBack) void syncNow()
    }
    getNetworkStateAsync().then(update).catch(() => {})
    const sub = addNetworkStateListener(update)
    return () => sub.remove()
  }, [syncNow])

  // After login, when the app returns to the foreground, and periodically.
  useEffect(() => {
    if (!signedIn) return
    void syncNow()
    const appState = AppState.addEventListener('change', (s) => { if (s === 'active') void syncNow() })
    const timer = setInterval(() => { if (AppState.currentState === 'active') void syncNow() }, SYNC_INTERVAL_MS)
    return () => { appState.remove(); clearInterval(timer) }
  }, [signedIn, syncNow])

  const value = useMemo<SyncStatus>(() => ({
    online, syncing, lastSyncAt, lastError, pending: counts.pending, rejected: counts.rejected, syncNow,
  }), [online, syncing, lastSyncAt, lastError, counts.pending, counts.rejected, syncNow])

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync must be used inside SyncProvider')
  return ctx
}
