import { TRPCError } from '@trpc/server'
import { count, eq } from 'drizzle-orm'
import { db } from '@/db'
import { estatesTable } from '@/db/schema'
import { areasTable } from '@/db/schema/areas'
import { router, managerProcedure } from '../../trpc'

export const managerEstateRouter = router({
  /** The manager's own estate, for the header and the start page. */
  get: managerProcedure.query(async ({ ctx }) => {
    const [estate] = await db
      .select({ id: estatesTable.id, name: estatesTable.name })
      .from(estatesTable)
      .where(eq(estatesTable.id, ctx.estateId))
      .limit(1)

    if (!estate) throw new TRPCError({ code: 'NOT_FOUND', message: 'Estate not found' })

    const [{ areaCount }] = await db
      .select({ areaCount: count() })
      .from(areasTable)
      .where(eq(areasTable.estateId, ctx.estateId))

    return { ...estate, areaCount }
  }),
})
