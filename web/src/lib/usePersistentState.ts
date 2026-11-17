import { useState } from 'react'

/**
 * Like useState, but remembered in this browser (localStorage). For display
 * preferences only; falls back to the default if storage is unavailable or
 * holds a value that isn't allowed.
 */
export function usePersistentState<T extends string>(key: string, initial: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored !== null && (allowed as readonly string[]).includes(stored) ? (stored as T) : initial
    } catch {
      return initial
    }
  })

  const update = (next: T) => {
    setValue(next)
    try { localStorage.setItem(key, next) } catch { /* private mode: keep it for this visit only */ }
  }

  return [value, update] as const
}
