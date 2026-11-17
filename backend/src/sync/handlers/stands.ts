import { z } from 'zod'
import { standDetailsSchema } from '@/schemas'
import {
  createStand as createStandInDb, moveStand as moveStandInDb, renameStand as renameStandInDb,
  StandNotFoundError, StandNumberTakenError, updateStandDetails,
} from '@/services/stands'
import type { MutationResult, SyncHandler, SyncUser } from '../types'

/**
 * Stand edits from the iPhone app (create, rename, move, details), pushed
 * through the sync outbox, so they also work offline. The rules live in
 * services/stands.ts (same as website and QGIS): own estate only, and a stand
 * number exists only once per area. A stand outside the area boundary is
 * accepted (the app warns before saving) and reported back as `outsideArea`.
 */

const standNumber = z.string().trim().min(1).max(32)
const lng = z.number().min(-180).max(180)
const lat = z.number().min(-90).max(90)

// Nickname and status are optional, so older app versions keep working.
const createPayload = standDetailsSchema.extend({ areaId: z.number().int().positive(), number: standNumber, lng, lat })
const renamePayload = z.object({ id: z.number().int().positive(), number: standNumber })
const movePayload = z.object({ id: z.number().int().positive(), lng, lat })
const updatePayload = standDetailsSchema.extend({ id: z.number().int().positive() })

/** Editing stands is for managers; staff only see them. */
function forbidden(user: SyncUser): MutationResult | null {
  return user.role === 'manager' ? null : { status: 'rejected', reason: 'forbidden' }
}

/** The service's errors as answers the app understands. */
async function answer(run: () => Promise<MutationResult>, notFound: string): Promise<MutationResult> {
  try {
    return await run()
  } catch (err) {
    if (err instanceof StandNotFoundError) return { status: 'rejected', reason: notFound }
    if (err instanceof StandNumberTakenError) return { status: 'rejected', reason: 'number_taken' }
    throw err
  }
}

export const createStand: SyncHandler<z.infer<typeof createPayload>> = {
  payload: createPayload,
  async apply(tx, p, user) {
    const denied = forbidden(user)
    if (denied) return denied
    return answer(async () => {
      const { areaId, number, lng: x, lat: y, ...details } = p
      const created = await createStandInDb(tx, user.estateId, areaId, { number, position: { lng: x, lat: y }, ...details })
      return {
        status: 'applied',
        data: { id: created.id, outsideArea: created.outsideArea, ...(created.details ? { details: created.details } : {}) },
      }
    }, 'area_not_found')
  },
}

export const renameStand: SyncHandler<z.infer<typeof renamePayload>> = {
  payload: renamePayload,
  async apply(tx, p, user) {
    const denied = forbidden(user)
    if (denied) return denied
    return answer(async () => {
      await renameStandInDb(tx, user.estateId, p.id, p.number)
      return { status: 'applied' }
    }, 'stand_not_found')
  },
}

export const moveStand: SyncHandler<z.infer<typeof movePayload>> = {
  payload: movePayload,
  async apply(tx, p, user) {
    const denied = forbidden(user)
    if (denied) return denied
    return answer(async () => {
      const { outsideArea } = await moveStandInDb(tx, user.estateId, p.id, { lng: p.lng, lat: p.lat })
      return { status: 'applied', data: { outsideArea } }
    }, 'stand_not_found')
  },
}

/** Nickname and status (with date). Returns the stored values, e.g. the date the server set. */
export const updateStand: SyncHandler<z.infer<typeof updatePayload>> = {
  payload: updatePayload,
  async apply(tx, p, user) {
    const denied = forbidden(user)
    if (denied) return denied
    const { id, ...details } = p
    return answer(async () => ({
      status: 'applied', data: { details: await updateStandDetails(tx, user.estateId, id, details) },
    }), 'stand_not_found')
  },
}
