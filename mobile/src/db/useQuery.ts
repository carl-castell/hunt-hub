import { addDatabaseChangeListener } from 'expo-sqlite'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Runs `query` and re-runs it whenever one of `tables` changes.
 * This is how screens read data: always from the local DB, never from the network.
 */
export function useQuery<T>(query: () => T, tables: string[], deps: unknown[] = []): T {
  const queryRef = useRef(query)
  queryRef.current = query
  const [value, setValue] = useState<T>(() => query())

  const refresh = useCallback(() => setValue(queryRef.current()), [])

  useEffect(() => {
    refresh()
    let scheduled = false
    const sub = addDatabaseChangeListener((e) => {
      if (!tables.includes(e.tableName) || scheduled) return
      // A sync writes many rows at once; re-run the query once per batch.
      scheduled = true
      setTimeout(() => { scheduled = false; refresh() }, 50)
    })
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, tables.join(','), ...deps])

  return value
}
