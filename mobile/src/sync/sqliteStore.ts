import type { SQLiteDatabase } from 'expo-sqlite'
import { applyStandPushResult } from '../db/standEdits'
import type { OutboxItem, PullResult, PushOutcome, SyncStore } from './types'

export const CURSOR_KEY = 'cursor'
export const LAST_SYNC_KEY = 'lastSyncAt'

export function getState(db: SQLiteDatabase, key: string): string | null {
  return db.getFirstSync<{ value: string | null }>('SELECT value FROM sync_state WHERE key = ?', key)?.value ?? null
}

export function setState(db: SQLiteDatabase, key: string, value: string | null) {
  db.runSync('INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value)
}

export function createSqliteSyncStore(db: SQLiteDatabase): SyncStore {
  return {
    async getCursor() {
      return getState(db, CURSOR_KEY)
    },

    async applyPull(r: PullResult) {
      db.withTransactionSync(() => {
        if (r.full) {
          db.execSync('DELETE FROM stands; DELETE FROM areas;')
        }
        for (const a of r.areas) {
          db.runSync(
            `INSERT INTO areas (id, name, geojson, updated_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, geojson = excluded.geojson, updated_at = excluded.updated_at`,
            a.id, a.name, a.geojson, a.updatedAt,
          )
        }
        for (const s of r.stands) {
          db.runSync(
            `INSERT INTO stands (id, area_id, number, lng, lat, updated_at) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET area_id = excluded.area_id, number = excluded.number,
               lng = excluded.lng, lat = excluded.lat, updated_at = excluded.updated_at`,
            s.id, s.areaId, s.number, s.lng, s.lat, s.updatedAt,
          )
        }
        for (const d of r.deleted) {
          if (d.entity === 'area') {
            // The server doesn't send tombstones for stands removed with their area.
            db.runSync('DELETE FROM stands WHERE area_id = ?', d.id)
            db.runSync('DELETE FROM areas WHERE id = ?', d.id)
          } else {
            db.runSync('DELETE FROM stands WHERE id = ?', d.id)
          }
        }
        setState(db, CURSOR_KEY, r.cursor)
        setState(db, LAST_SYNC_KEY, new Date().toISOString())
      })
    },

    async pendingMutations(limit) {
      const rows = db.getAllSync<{ id: string; type: string; payload: string; created_at: string; attempts: number }>(
        `SELECT id, type, payload, created_at, attempts FROM outbox WHERE status = 'pending' ORDER BY created_at, rowid LIMIT ?`,
        limit,
      )
      return rows.map((r): OutboxItem => ({
        id: r.id, type: r.type, payload: JSON.parse(r.payload), createdAt: r.created_at, attempts: r.attempts,
      }))
    },

    async recordPushResults(results: PushOutcome[]) {
      db.withTransactionSync(() => {
        for (const r of results) {
          // Stand edits react to the answer: real id for new stands, undo when refused.
          const item = db.getFirstSync<{ type: string; payload: string }>('SELECT type, payload FROM outbox WHERE id = ?', r.id)
          if (item?.type.startsWith('stand.') && r.status !== 'error') applyStandPushResult(db, item.type, JSON.parse(item.payload), r)
          if (r.status === 'applied') {
            db.runSync('DELETE FROM outbox WHERE id = ?', r.id)
          } else if (r.status === 'error') {
            db.runSync('UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?', 'server_error', r.id)
          } else {
            db.runSync(`UPDATE outbox SET status = 'rejected', attempts = attempts + 1, last_error = ? WHERE id = ?`, `${r.status}: ${r.reason}`, r.id)
          }
        }
      })
    },
  }
}
