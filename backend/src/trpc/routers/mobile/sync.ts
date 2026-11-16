import { z } from 'zod'
import { pullChanges } from '@/sync/pull'
import { pushMutations } from '@/sync/push'
import { fieldProcedure, router } from '../../trpc'

export const mobileSyncRouter = router({
  pull: fieldProcedure
    .input(z.object({ cursor: z.iso.datetime().nullish() }))
    .query(({ input, ctx }) => pullChanges(ctx.user.estateId, input.cursor ?? null)),

  push: fieldProcedure
    .input(z.object({
      mutations: z.array(z.object({
        id: z.uuid(),
        type: z.string().min(1).max(64),
        payload: z.unknown(),
        createdAt: z.iso.datetime(),
      })).max(100),
    }))
    .mutation(({ input, ctx }) => pushMutations(input.mutations, ctx.user)),
})
