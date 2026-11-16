import { randomUUID } from 'expo-crypto'
import type { SQLiteDatabase } from 'expo-sqlite'

/**
 * Queues a change for the server. Call it in the same transaction as the
 * optimistic local write, e.g. when stand editing is added:
 *
 *   db.withTransactionSync(() => {
 *     db.runSync('UPDATE stands SET lng = ?, lat = ? WHERE id = ?', lng, lat, id)
 *     enqueue(db, 'stand.move', { id, lng, lat })
 *   })
 *
 * The matching server handler goes in backend/src/sync/handlers/.
 */
export function enqueue(db: SQLiteDatabase, type: string, payload: unknown): string {
  const id = randomUUID()
  db.runSync(
    'INSERT INTO outbox (id, type, payload, created_at) VALUES (?, ?, ?, ?)',
    id, type, JSON.stringify(payload), new Date().toISOString(),
  )
  return id
}
