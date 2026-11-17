import { router } from '../../trpc'
import { managerEstateRouter } from './estate'
import { managerAreasRouter } from './areas'
import { managerStandsRouter } from './stands'
import { managerDrivesRouter, managerEventsRouter, managerInvitationsRouter } from './events'

/**
 * API for the React manager area. Every procedure uses `managerProcedure`
 * and is scoped to `ctx.estateId`. Screens move here one by one from the
 * server-rendered manager pages.
 */
export const managerRouter = router({
  estate: managerEstateRouter,
  areas: managerAreasRouter,
  stands: managerStandsRouter,
  events: managerEventsRouter,
  drives: managerDrivesRouter,
  invitations: managerInvitationsRouter,
})
