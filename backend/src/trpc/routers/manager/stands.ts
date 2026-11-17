import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { db } from '@/db'
import { standDetailsSchema } from '@/schemas'
import { audit } from '@/services/audit'
import { StandNotFoundError, updateStandDetails } from '@/services/stands'
import { router, managerProcedure } from '../../trpc'

export const managerStandsRouter = router({
  /** Change a stand's nickname and/or status (with date). Missing fields stay as they are. */
  update: managerProcedure
    .input(standDetailsSchema.extend({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...details } = input
      try {
        const result = await db.transaction((tx) => updateStandDetails(tx, ctx.estateId, id, details))
        await audit({ userId: ctx.user.id, event: 'stand_updated', ip: ctx.ip, metadata: { standId: id, source: 'web' } })
        return { id, ...result }
      } catch (err) {
        if (err instanceof StandNotFoundError) throw new TRPCError({ code: 'NOT_FOUND', message: err.message })
        throw err
      }
    }),
})
