import { router } from './trpc'
import { authRouter } from './routers/auth'
import { adminRouter } from './routers/admin'
import { mobileRouter } from './routers/mobile'
import { managerRouter } from './routers/manager'
import { devRouter } from './routers/dev'
import { rsvpRouter } from './routers/rsvp'

export const appRouter = router({
  auth: authRouter,
  admin: adminRouter,
  manager: managerRouter,
  mobile: mobileRouter,
  // Public: the guest's answer page (the link's id is the key).
  rsvp: rsvpRouter,
  // Local development only, see utils/devLogin.ts
  dev: devRouter,
})

export type AppRouter = typeof appRouter
