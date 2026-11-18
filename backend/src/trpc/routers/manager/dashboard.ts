import { getDashboard } from '@/services/dashboard'
import { managerProcedure, router } from '../../trpc'

export const managerDashboardRouter = router({
  /** The start page: next hunt, to-dos, upcoming hunts, areas. */
  get: managerProcedure.query(({ ctx }) => getDashboard(ctx.estateId)),
})
