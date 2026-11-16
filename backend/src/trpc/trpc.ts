import { initTRPC, TRPCError } from '@trpc/server'
import type { Context } from './context'
import { resolveAccessToken } from '@/services/mobileSessions'
import { getUserAccess } from '@/services/userAccess'

export const FIELD_ROLES = ['manager', 'staff'] as const
export const isFieldRole = (role: string): role is typeof FIELD_ROLES[number] =>
  (FIELD_ROLES as readonly string[]).includes(role)

const t = initTRPC.context<Context>().create()

export const router = t.router
export const createCallerFactory = t.createCallerFactory
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, user: ctx.user } })
})

export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' })
  return next({ ctx: { ...ctx, user: ctx.user } })
})

/**
 * For the manager area of the web app (session cookie). Like the
 * `requireManager` middleware of the server-rendered pages, it re-reads role
 * and active flag from the database on every call, so a demoted or
 * deactivated manager loses access immediately. Puts `estateId` on the
 * context: every manager procedure must scope its queries with it.
 */
export const managerProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  const access = await getUserAccess(ctx.user.id)
  if (!access || access.role !== 'manager' || !access.active || access.estateId === null) {
    throw new TRPCError({ code: 'FORBIDDEN' })
  }
  return next({ ctx: { ...ctx, user: ctx.user, estateId: access.estateId } })
})

/**
 * For the mobile app: authenticates with a Bearer token from a mobile session
 * and only allows estate members who work in the field (manager, staff).
 */
export const fieldProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.bearerToken) throw new TRPCError({ code: 'UNAUTHORIZED' })
  const resolved = await resolveAccessToken(ctx.bearerToken)
  if (!resolved) throw new TRPCError({ code: 'UNAUTHORIZED' })
  const { user, sessionId } = resolved
  if (!isFieldRole(user.role) || user.estateId === null) throw new TRPCError({ code: 'FORBIDDEN' })
  return next({ ctx: { ...ctx, user: { ...user, estateId: user.estateId }, mobileSessionId: sessionId } })
})
