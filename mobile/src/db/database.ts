import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite'
import { MIGRATIONS } from './migrations'

let db: SQLiteDatabase | null = null

/** The app's offline store. Opened once and migrated on first use. */
export function getDb(): SQLiteDatabase {
  if (db) return db
  db = openDatabaseSync('hunthub.db', { enableChangeListener: true })
  db.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  migrate(db)
  return db
}

function migrate(database: SQLiteDatabase) {
  const row = database.getFirstSync<{ user_version: number }>('PRAGMA user_version')
  const current = row?.user_version ?? 0
  for (let v = current; v < MIGRATIONS.length; v++) {
    database.withTransactionSync(() => {
      database.execSync(MIGRATIONS[v])
      database.execSync(`PRAGMA user_version = ${v + 1}`)
    })
  }
}
