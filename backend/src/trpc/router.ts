import { router } from './trpc'
import { authRouter } from './routers/auth'
import { adminRouter } from './routers/admin'

export const appRouter = router({
  auth: authRouter,
  admin: adminRouter,
})

export type AppRouter = typeof appRouter
