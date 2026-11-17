import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { MutationResult, SyncHandler, SyncUser, Tx } from '../types'

/**
 * Stand edits from the iPhone app (create, rename, move), pushed through the
 * sync outbox, so they also work offline. Same rules as the website and QGIS:
 * own estate only, and a stand number exists only once per area. A stand
 * outside the area boundary is accepted (the app warns before saving) and
 * reported back as `outsideArea`.
 */

const standNumber = z.string().trim().min(1).max(32)
const lng = z.number().min(-180).max(180)
const lat = z.number().min(-90).max(90)

const createPayload = z.object({ areaId: z.number().int().positive(), number: standNumber, lng, lat })
const renamePayload = z.object({ id: z.number().int().positive(), number: standNumber })
const movePayload = z.object({ id: z.number().int().positive(), lng, lat })

/** Editing stands is for managers; staff only see them. */
function forbidden(user: SyncUser): MutationResult | null {
  return user.role === 'manager' ? null : { status: 'rejected', reason: 'forbidden' }
}

/**
 * Locks the area (if it belongs to the user's estate) for the rest of the
 * transaction, so two phones can't both create or rename to the same number.
 */
async function lockArea(tx: Tx, areaId: number, estateId: number): Promise<boolean> {
  const res = await tx.execute(sql`SELECT id FROM areas WHERE id = ${areaId} AND estate_id = ${estateId} FOR UPDATE`)
  return res.rows.length > 0
}

/** The stand's area, if the stand belongs to the user's estate. */
async function areaOfStand(tx: Tx, standId: number, estateId: number): Promise<number | null> {
  const res = await tx.execute<{ area_id: number }>(sql`
    SELECT s.area_id FROM stands s JOIN areas a ON a.id = s.area_id
    WHERE s.id = ${standId} AND a.estate_id = ${estateId}`)
  return res.rows[0]?.area_id ?? null
}

async function numberTaken(tx: Tx, areaId: number, number: string, exceptStandId?: number): Promise<boolean> {
  const res = await tx.execute(sql`
    SELECT 1 FROM stands WHERE area_id = ${areaId} AND number = ${number}
    ${exceptStandId ? sql`AND id <> ${exceptStandId}` : sql``} LIMIT 1`)
  return res.rows.length > 0
}

/** Whether a point lies outside the area's boundary (false if the area has none). */
async function outsideArea(tx: Tx, areaId: number, lngValue: number, latValue: number): Promise<boolean> {
  const res = await tx.execute<{ outside: boolean }>(sql`
    SELECT geofile IS NOT NULL AND NOT ST_Covers(geofile, ST_SetSRID(ST_MakePoint(${lngValue}, ${latValue}), 4326)) AS outside
    FROM areas WHERE id = ${areaId}`)
  return res.rows[0]?.outside ?? false
}

export const createStand: SyncHandler<z.infer<typeof createPayload>> = {
  payload: createPayload,
  async apply(tx, p, user) {
    const denied = forbidden(user)
    if (denied) return denied
    if (!(await lockArea(tx, p.areaId, user.estateId))) return { status: 'rejected', reason: 'area_not_found' }
    if (await numberTaken(tx, p.areaId, p.number)) return { status: 'rejected', reason: 'number_taken' }

    const res = await tx.execute<{ id: number }>(sql`
      INSERT INTO stands (area_id, number, location)
      VALUES (${p.areaId}, ${p.number}, ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326))
      RETURNING id`)
    return { status: 'applied', data: { id: res.rows[0].id, outsideArea: await outsideArea(tx, p.areaId, p.lng, p.lat) } }
  },
}

export const renameStand: SyncHandler<z.infer<typeof renamePayload>> = {
  payload: renamePayload,
  async apply(tx, p, user) {
    const denied = forbidden(user)
    if (denied) return denied
    const areaId = await areaOfStand(tx, p.id, user.estateId)
    if (areaId === null) return { status: 'rejected', reason: 'stand_not_found' }
    await lockArea(tx, areaId, user.estateId)
    if (await numberTaken(tx, areaId, p.number, p.id)) return { status: 'rejected', reason: 'number_taken' }

    await tx.execute(sql`UPDATE stands SET number = ${p.number} WHERE id = ${p.id}`)
    return { status: 'applied' }
  },
}

export const moveStand: SyncHandler<z.infer<typeof movePayload>> = {
  payload: movePayload,
  async apply(tx, p, user) {
    const denied = forbidden(user)
    if (denied) return denied
    const areaId = await areaOfStand(tx, p.id, user.estateId)
    if (areaId === null) return { status: 'rejected', reason: 'stand_not_found' }

    await tx.execute(sql`UPDATE stands SET location = ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326) WHERE id = ${p.id}`)
    return { status: 'applied', data: { outsideArea: await outsideArea(tx, areaId, p.lng, p.lat) } }
  },
}
