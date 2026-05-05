import { router } from '../../trpc'
import { adminAccountRouter } from './account'

export const adminRouter = router({
  account: adminAccountRouter,
})
