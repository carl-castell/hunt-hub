import { router } from '../../trpc'
import { managerEstateRouter } from './estate'

/**
 * API for the React manager area. Every procedure uses `managerProcedure`
 * and is scoped to `ctx.estateId`. Screens move here one by one from the
 * server-rendered manager pages.
 */
export const managerRouter = router({
  estate: managerEstateRouter,
})
