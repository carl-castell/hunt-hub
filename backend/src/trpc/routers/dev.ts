import { TRPCError } from '@trpc/server'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { accountsTable } from '@/db/schema/accounts'
import { usersTable } from '@/db/schema/users'
import { isDevLoginEnabled } from '@/utils/devLogin'
import { logger } from '@/utils/logger'
import { publicProcedure, router } from '../trpc'
import { startSessionFor } from './auth'

/**
 * Local development only: every call answers "not found" unless DEV_LOGIN=true
 * is set and the server isn't running in production (it refuses to start then).
 */
const devProcedure = publicProcedure.use(({ next }) => {
  if (!isDevLoginEnabled()) throw new TRPCError({ code: 'NOT_FOUND' })
  return next()
})

/** Users with their own area in the web app. */
const WEB_ROLES = ['admin', 'manager'] as const

export const devRouter = router({
  /** Active admins and managers, for the picker on the login page. */
  users: devProcedure.query(() =>
    db.select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: accountsTable.email,
      role: usersTable.role,
    })
      .from(usersTable)
      .innerJoin(accountsTable, eq(accountsTable.userId, usersTable.id))
      .where(and(eq(accountsTable.active, true), inArray(usersTable.role, [...WEB_ROLES])))
      .orderBy(asc(usersTable.role), asc(usersTable.lastName), asc(usersTable.firstName)),
  ),

  /** Logs in as this user without password or two-factor code. */
  loginAs: devProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const [row] = await db.select({ active: accountsTable.active })
        .from(accountsTable).where(eq(accountsTable.userId, input.userId)).limit(1)
      if (!row?.active) throw new TRPCError({ code: 'NOT_FOUND', message: 'No active user with this id.' })

      logger.warn({ userId: input.userId }, 'dev login (DEV_LOGIN=true): logged in without password')
      return startSessionFor(ctx, input.userId, { devLogin: true })
    }),
})
