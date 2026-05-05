import { router } from '../../trpc'
import { adminAccountRouter } from './account'
import { adminEstatesRouter } from './estates'
import { adminManagersRouter } from './managers'
import { adminAuditRouter } from './audit'
import { adminSettingsRouter } from './settings'

export const adminRouter = router({
  account:  adminAccountRouter,
  estates:  adminEstatesRouter,
  managers: adminManagersRouter,
  audit:    adminAuditRouter,
  settings: adminSettingsRouter,
})
