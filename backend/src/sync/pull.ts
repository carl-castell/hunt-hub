import { sql } from 'drizzle-orm'
import { db } from '@/db'
import type { StandStatus } from '@/shared/standStatus'

/** Re-send changes from slightly before the cursor, so rows written by transactions that
 *  were still open when the previous pull ran are not missed. Upserts make this harmless. */
export const CURSOR_LOOKBACK = '5 minutes'
/** Tombstones are kept this long; clients with an older cursor get a full snapshot. */
export const TOMBSTONE_RETENTION_DAYS = 90

export type PulledArea = { id: number; name: string; geojson: string | null; updatedAt: string }
export type PulledStand = {
  id: number; areaId: number; number: string; lng: number | null; lat: number | null
  nickname: string | null; status: StandStatus | null; statusDate: string | null
  updatedAt: string
}
export type PulledDelete = { entity: 'area' | 'stand'; id: number }

export type PullResult = {
  full: boolean
  cursor: string
  areas: PulledArea[]
  stands: PulledStand[]
  deleted: PulledDelete[]
}

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`

export async function pullChanges(estateId: number, cursor: string | null): Promise<PullResult> {
  await db.execute(sql`DELETE FROM sync_tombstones WHERE deleted_at < now() - make_interval(days => ${TOMBSTONE_RETENTION_DAYS})`)

  return db.transaction(async (tx) => {
    const nowRes = await tx.execute<{ now: string; too_old: boolean }>(sql`
      SELECT to_char(now() AT TIME ZONE 'UTC', ${sql.raw(ISO)}) AS now,
             ${cursor}::timestamptz IS NOT NULL
               AND ${cursor}::timestamptz < now() - make_interval(days => ${TOMBSTONE_RETENTION_DAYS}) AS too_old
    `)
    const { now, too_old } = nowRes.rows[0]
    const full = cursor === null || too_old
    const since = full ? null : cursor

    const areas = await tx.execute<PulledArea>(sql`
      SELECT id, name, ST_AsGeoJSON(geofile) AS geojson,
             to_char(updated_at AT TIME ZONE 'UTC', ${sql.raw(ISO)}) AS "updatedAt"
      FROM areas
      WHERE estate_id = ${estateId}
        ${since ? sql`AND updated_at > ${since}::timestamptz - interval '${sql.raw(CURSOR_LOOKBACK)}'` : sql``}
      ORDER BY id
    `)

    const stands = await tx.execute<PulledStand>(sql`
      SELECT s.id, s.area_id AS "areaId", s.number,
             ST_X(s.location) AS lng, ST_Y(s.location) AS lat,
             s.nickname, s.status, to_char(s.status_date, 'YYYY-MM-DD') AS "statusDate",
             to_char(s.updated_at AT TIME ZONE 'UTC', ${sql.raw(ISO)}) AS "updatedAt"
      FROM stands s
      JOIN areas a ON a.id = s.area_id
      WHERE a.estate_id = ${estateId}
        ${since ? sql`AND s.updated_at > ${since}::timestamptz - interval '${sql.raw(CURSOR_LOOKBACK)}'` : sql``}
      ORDER BY s.id
    `)

    const deleted = since
      ? (await tx.execute<PulledDelete>(sql`
          SELECT DISTINCT entity, entity_id AS id
          FROM sync_tombstones
          WHERE estate_id = ${estateId}
            AND deleted_at > ${since}::timestamptz - interval '${sql.raw(CURSOR_LOOKBACK)}'
        `)).rows
      : []

    return { full, cursor: now, areas: areas.rows, stands: stands.rows, deleted }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}
