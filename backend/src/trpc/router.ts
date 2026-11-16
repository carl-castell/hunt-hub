import { router } from './trpc'
import { authRouter } from './routers/auth'
import { adminRouter } from './routers/admin'
import { mobileRouter } from './routers/mobile'
import { managerRouter } from './routers/manager'

export const appRouter = router({
  auth: authRouter,
  admin: adminRouter,
  manager: managerRouter,
  mobile: mobileRouter,
})

export type AppRouter = typeof appRouter
