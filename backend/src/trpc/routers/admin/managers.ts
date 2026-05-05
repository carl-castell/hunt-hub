import crypto from 'crypto'
import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { usersTable, userAuthTokensTable } from '@/db/schema'
import { accountsTable } from '@/db/schema/accounts'
import { audit } from '@/services/audit'
import { renderTemplate, sendMail } from '@/services/mail'
import { getBaseUrl } from '@/utils/url'
import { logError } from '@/utils/logError'
import { adminProcedure, router } from '../../trpc'

export const adminManagersRouter = router({
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [row] = await db
        .select({
          id:        usersTable.id,
          firstName: usersTable.firstName,
          lastName:  usersTable.lastName,
          role:      usersTable.role,
          estateId:  usersTable.estateId,
          email:     accountsTable.email,
          active:    accountsTable.active,
        })
        .from(usersTable)
        .innerJoin(accountsTable, eq(accountsTable.userId, usersTable.id))
        .where(eq(usersTable.id, input.id))
        .limit(1)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Manager not found.' })
      return row
    }),

  deactivate: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.update(accountsTable).set({ active: false }).where(eq(accountsTable.userId, input.id))
      await audit({ userId: ctx.user.id, event: 'user_deactivated', ip: ctx.ip, metadata: { targetUserId: input.id } })
      return { ok: true }
    }),

  sendActivationLink: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const [row] = await db
        .select({ firstName: usersTable.firstName, email: accountsTable.email })
        .from(usersTable)
        .innerJoin(accountsTable, eq(accountsTable.userId, usersTable.id))
        .where(eq(usersTable.id, input.id))
        .limit(1)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Manager not found.' })

      const token = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48)

      await db.transaction(async (tx) => {
        await tx.delete(userAuthTokensTable).where(eq(userAuthTokensTable.userId, input.id))
        await tx.insert(userAuthTokensTable).values({ userId: input.id, token, type: 'activation', expiresAt })
      })

      await audit({ userId: ctx.user.id, event: 'user_resend_activation', ip: ctx.ip, metadata: { targetUserId: input.id } })

      try {
        const html = await renderTemplate('activation', {
          firstName: row.firstName,
          activationLink: `${getBaseUrl(ctx.req)}/activate/${token}`,
          year: new Date().getFullYear(),
          expiresAt,
        })
        await sendMail({ to: row.email, subject: 'Activate your Hunt Hub account', html })
      } catch (err) {
        logError('[email error] Failed to send activation email:', err)
      }

      return { ok: true }
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const [row] = await db
        .select({ email: accountsTable.email })
        .from(usersTable)
        .leftJoin(accountsTable, eq(accountsTable.userId, usersTable.id))
        .where(eq(usersTable.id, input.id))
        .limit(1)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Manager not found.' })
      await db.delete(usersTable).where(eq(usersTable.id, input.id))
      await audit({ userId: ctx.user.id, event: 'user_deleted', ip: ctx.ip, metadata: { targetUserId: input.id, email: row.email } })
      return { ok: true }
    }),
})
