import { router } from '../../trpc'
import { mobileAuthRouter } from './auth'
import { mobileSyncRouter } from './sync'

export const mobileRouter = router({
  auth: mobileAuthRouter,
  sync: mobileSyncRouter,
})
