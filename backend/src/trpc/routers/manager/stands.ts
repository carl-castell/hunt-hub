import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { db } from '@/db'
import { standDetailsSchema } from '@/schemas'
import { audit } from '@/services/audit'
import {
  createStand, deleteStand, moveStand, renameStand, StandNotFoundError, StandNumberTakenError, updateStandDetails,
} from '@/services/stands'
import { STAND_NUMBER_MAX } from '@/shared/standStatus'
import { router, managerProcedure } from '../../trpc'

const id = z.number().int().positive()
const position = z.object({ lng: z.number().min(-180).max(180), lat: z.number().min(-90).max(90) })
const standNumber = z.string().trim().min(1, 'Please enter a number').max(STAND_NUMBER_MAX)

/** The stand service's errors as tRPC errors; the website shows the message. */
const standProcedure = managerProcedure.use(async ({ next }) => {
  const result = await next()
  if (!result.ok) {
    const cause = result.error.cause
    if (cause instanceof StandNotFoundError) throw new TRPCError({ code: 'NOT_FOUND', message: cause.message })
    if (cause instanceof StandNumberTakenError) throw new TRPCError({ code: 'CONFLICT', message: cause.message })
    throw result.error
  }
  return result
})

const actorOf = (ctx: { user: { id: number }; ip: string }) => ({ userId: ctx.user.id, ip: ctx.ip })

export const managerStandsRouter = router({
  /** A new stand on the map. Without a number it gets the next "NOT-NAMED-<n>". */
  create: standProcedure
    .input(standDetailsSchema.extend({
      areaId: id,
      number: z.string().trim().max(STAND_NUMBER_MAX).optional(),
      position,
    }))
    .mutation(async ({ ctx, input }) => {
      const { areaId, ...rest } = input
      const created = await db.transaction((tx) => createStand(tx, ctx.estateId, areaId, rest))
      await audit({ ...actorOf(ctx), event: 'stand_created', metadata: { standId: created.id, areaId, source: 'web' } })
      return created
    }),

  rename: standProcedure
    .input(z.object({ id, number: standNumber }))
    .mutation(async ({ ctx, input }) => {
      await db.transaction((tx) => renameStand(tx, ctx.estateId, input.id, input.number))
      await audit({ ...actorOf(ctx), event: 'stand_updated', metadata: { standId: input.id, source: 'web' } })
    }),

  move: standProcedure
    .input(z.object({ id, position }))
    .mutation(async ({ ctx, input }) => {
      const result = await moveStand(db, ctx.estateId, input.id, input.position)
      await audit({ ...actorOf(ctx), event: 'stand_updated', metadata: { standId: input.id, source: 'web' } })
      return result
    }),

  delete: standProcedure
    .input(z.object({ id }))
    .mutation(async ({ ctx, input }) => {
      await deleteStand(db, ctx.estateId, input.id)
      await audit({ ...actorOf(ctx), event: 'stand_deleted', metadata: { standId: input.id, source: 'web' } })
    }),

  /** Change a stand's nickname and/or status (with date). Missing fields stay as they are. */
  update: standProcedure
    .input(standDetailsSchema.extend({ id }))
    .mutation(async ({ ctx, input }) => {
      const { id: standId, ...details } = input
      const result = await db.transaction((tx) => updateStandDetails(tx, ctx.estateId, standId, details))
      await audit({ ...actorOf(ctx), event: 'stand_updated', metadata: { standId, source: 'web' } })
      return { id: standId, ...result }
    }),
})
