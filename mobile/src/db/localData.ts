import type { SQLiteDatabase } from 'expo-sqlite'

export function pendingChangeCount(db: SQLiteDatabase): number {
  return db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM outbox WHERE status = 'pending'`)?.n ?? 0
}

/** Removes everything that belongs to the signed-in user. Imported basemaps and app settings are kept. */
export function wipeUserData(db: SQLiteDatabase) {
  db.withTransactionSync(() => {
    db.execSync('DELETE FROM stands; DELETE FROM areas; DELETE FROM outbox; DELETE FROM sync_state; DELETE FROM area_map_settings;')
  })
}
