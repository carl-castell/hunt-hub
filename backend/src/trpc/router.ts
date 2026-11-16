import { router } from './trpc'
import { authRouter } from './routers/auth'
import { adminRouter } from './routers/admin'
import { mobileRouter } from './routers/mobile'

export const appRouter = router({
  auth: authRouter,
  admin: adminRouter,
  mobile: mobileRouter,
})

export type AppRouter = typeof appRouter
