import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { loginSchema } from '@/schemas'
import { audit } from '@/services/audit'
import { verifyCredentials } from '@/services/credentials'
import { createMobileSession, refreshMobileSession, revokeMobileSession, loadActiveUser } from '@/services/mobileSessions'
import { fieldProcedure, isFieldRole, publicProcedure, router } from '../../trpc'

const mobileLoginSchema = loginSchema.extend({
  deviceName: z.string().trim().max(255).optional(),
})

export const mobileAuthRouter = router({
  login: publicProcedure
    .input(mobileLoginSchema)
    .mutation(async ({ input, ctx }) => {
      const { account, user } = await verifyCredentials(input.email, input.password, ctx.ip)

      if (!isFieldRole(user.role) || user.estateId === null) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'The app is only available to managers and staff.' })
      }

      const session = await createMobileSession(user.id, input.deviceName)
      await audit({ userId: user.id, event: 'login', ip: ctx.ip, metadata: { client: 'mobile', deviceName: input.deviceName ?? null } })

      const sessionUser: SessionUser = {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: account.email,
        role: user.role,
        active: account.active,
        estateId: user.estateId,
      }
      return {
        user: sessionUser,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        accessExpiresAt: session.accessExpiresAt.toISOString(),
        refreshExpiresAt: session.refreshExpiresAt.toISOString(),
      }
    }),

  refresh: publicProcedure
    .input(z.object({ refreshToken: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const refreshed = await refreshMobileSession(input.refreshToken)
      if (!refreshed) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Session expired. Please log in again.' })

      // Re-check the user: they may have been deactivated or changed role since login.
      const user = await loadActiveUser(refreshed.userId)
      if (!user || !isFieldRole(user.role) || user.estateId === null) {
        await revokeMobileSession(refreshed.sessionId)
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Session expired. Please log in again.' })
      }

      return {
        user,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        accessExpiresAt: refreshed.accessExpiresAt.toISOString(),
        refreshExpiresAt: refreshed.refreshExpiresAt.toISOString(),
      }
    }),

  me: fieldProcedure.query(({ ctx }) => ctx.user),

  logout: fieldProcedure.mutation(async ({ ctx }) => {
    await revokeMobileSession(ctx.mobileSessionId)
    await audit({ userId: ctx.user.id, event: 'logout', ip: ctx.ip, metadata: { client: 'mobile' } })
    return { ok: true }
  }),
})
