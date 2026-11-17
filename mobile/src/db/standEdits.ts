import type { SQLiteDatabase } from 'expo-sqlite'
import { enqueue } from '../sync/outbox'
import { todayIso, type StandStatus } from '../stands/status'

/**
 * Stand edits on the phone. Each one changes the local database at once
 * (the map shows it immediately, also offline) and queues the change for the
 * server in the same transaction. The server checks it on the next sync; if it
 * refuses, `applyStandPushResult` undoes the local change.
 *
 * A new stand has a temporary negative id until the server confirms it and
 * returns the real one. Changes to a stand that hasn't reached the server yet
 * are folded into its pending "create" instead of being queued separately.
 */

type Position = { lng: number; lat: number }

export function numberExists(db: SQLiteDatabase, areaId: number, number: string, exceptId?: number): boolean {
  return db.getFirstSync('SELECT 1 FROM stands WHERE area_id = ? AND number = ? AND id IS NOT ?', areaId, number.trim(), exceptId ?? null) !== null
}

function nextTemporaryId(db: SQLiteDatabase): number {
  const row = db.getFirstSync<{ min: number | null }>('SELECT MIN(id) AS min FROM stands')
  return Math.min(-1, (row?.min ?? 0) - 1)
}

/** The pending "create" of a stand that hasn't reached the server yet. */
function pendingCreate(db: SQLiteDatabase, tempId: number) {
  return db.getFirstSync<{ id: string; payload: string }>(
    `SELECT id, payload FROM outbox WHERE type = 'stand.create' AND status = 'pending' AND json_extract(payload, '$.tempId') = ?`, tempId,
  )
}

function updatePendingCreate(db: SQLiteDatabase, tempId: number, changes: Record<string, unknown>): boolean {
  const row = pendingCreate(db, tempId)
  if (!row) return false
  db.runSync('UPDATE outbox SET payload = ? WHERE id = ?', JSON.stringify({ ...JSON.parse(row.payload), ...changes }), row.id)
  return true
}

const now = () => new Date().toISOString()

export function createStandLocal(db: SQLiteDatabase, areaId: number, number: string, position: Position): number {
  const tempId = nextTemporaryId(db)
  db.withTransactionSync(() => {
    db.runSync('INSERT INTO stands (id, area_id, number, lng, lat, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      tempId, areaId, number.trim(), position.lng, position.lat, now())
    enqueue(db, 'stand.create', { areaId, number: number.trim(), lng: position.lng, lat: position.lat, tempId })
  })
  return tempId
}

export function renameStandLocal(db: SQLiteDatabase, id: number, number: string) {
  const previous = db.getFirstSync<{ number: string }>('SELECT number FROM stands WHERE id = ?', id)
  if (!previous) return
  db.withTransactionSync(() => {
    db.runSync('UPDATE stands SET number = ?, updated_at = ? WHERE id = ?', number.trim(), now(), id)
    if (id < 0 && updatePendingCreate(db, id, { number: number.trim() })) return
    enqueue(db, 'stand.rename', { id, number: number.trim(), previousNumber: previous.number })
  })
}

export function moveStandLocal(db: SQLiteDatabase, id: number, position: Position) {
  const previous = db.getFirstSync<{ lng: number | null; lat: number | null }>('SELECT lng, lat FROM stands WHERE id = ?', id)
  if (!previous) return
  db.withTransactionSync(() => {
    db.runSync('UPDATE stands SET lng = ?, lat = ?, updated_at = ? WHERE id = ?', position.lng, position.lat, now(), id)
    if (id < 0 && updatePendingCreate(db, id, position)) return
    enqueue(db, 'stand.move', { id, ...position, previous })
  })
}

export type StandDetails = { nickname: string | null; status: StandStatus | null; statusDate: string | null }

/**
 * New nickname and/or status. A changed status gets today's date (the day of
 * the change, even if it only reaches the server days later); no status, no date.
 */
export function updateStandDetailsLocal(db: SQLiteDatabase, id: number, changes: { nickname: string | null; status: StandStatus | null }) {
  const previous = db.getFirstSync<StandDetails>('SELECT nickname, status, status_date AS statusDate FROM stands WHERE id = ?', id)
  if (!previous) return
  const nickname = changes.nickname?.trim() || null
  const status = changes.status
  const statusDate = status === null ? null : status === previous.status ? previous.statusDate ?? todayIso() : todayIso()
  if (nickname === previous.nickname && status === previous.status && statusDate === previous.statusDate) return

  db.withTransactionSync(() => {
    db.runSync('UPDATE stands SET nickname = ?, status = ?, status_date = ?, updated_at = ? WHERE id = ?',
      nickname, status, statusDate, now(), id)
    const details = { nickname, status, ...(statusDate ? { statusDate } : {}) }
    if (id < 0 && updatePendingCreate(db, id, details)) return
    enqueue(db, 'stand.update', { id, ...details, previous })
  })
}

type PushResult = { status: string; data?: unknown }

/**
 * After the server answered a stand change: a confirmed new stand gets its
 * real id; a refused change is undone locally. Runs inside the transaction
 * that records the push results.
 */
export function applyStandPushResult(db: SQLiteDatabase, type: string, payload: any, result: PushResult) {
  const refused = result.status === 'rejected' || result.status === 'conflict'
  if (type === 'stand.create') {
    if (result.status === 'applied') {
      const realId = (result.data as { id?: number } | undefined)?.id
      if (realId) db.runSync('UPDATE stands SET id = ? WHERE id = ?', realId, payload.tempId)
    } else if (refused) {
      db.runSync('DELETE FROM stands WHERE id = ?', payload.tempId)
    }
  } else if (type === 'stand.rename' && refused) {
    db.runSync('UPDATE stands SET number = ? WHERE id = ?', payload.previousNumber, payload.id)
  } else if (type === 'stand.move' && refused && payload.previous) {
    db.runSync('UPDATE stands SET lng = ?, lat = ? WHERE id = ?', payload.previous.lng, payload.previous.lat, payload.id)
  } else if (type === 'stand.update' && refused && payload.previous) {
    const p = payload.previous as StandDetails
    db.runSync('UPDATE stands SET nickname = ?, status = ?, status_date = ? WHERE id = ?', p.nickname, p.status, p.statusDate, payload.id)
  }
}
