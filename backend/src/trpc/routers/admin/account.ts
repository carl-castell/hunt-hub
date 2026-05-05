import bcrypt from 'bcrypt'
import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { usersTable } from '@/db/schema/users'
import { accountsTable } from '@/db/schema/accounts'
import { isPasswordPwned } from '@/services/hibp'
import { audit } from '@/services/audit'
import { sessionPool } from '@/app'
import { changePasswordSchema } from '@/schemas'
import { adminProcedure, router } from '../../trpc'

export const adminAccountRouter = router({
  get: adminProcedure.query(async ({ ctx }) => {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, ctx.user.id)).limit(1)
    const [account] = await db.select({ email: accountsTable.email }).from(accountsTable).where(eq(accountsTable.userId, ctx.user.id)).limit(1)
    if (!user || !account) throw new TRPCError({ code: 'NOT_FOUND' })
    return { firstName: user.firstName, lastName: user.lastName, email: account.email, role: user.role }
  }),

  changePassword: adminProcedure
    .input(changePasswordSchema)
    .mutation(async ({ input, ctx }) => {
      const [account] = await db.select().from(accountsTable).where(eq(accountsTable.userId, ctx.user.id)).limit(1)
      if (!account?.password) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No password set.' })

      if (!await bcrypt.compare(input.oldPassword, account.password)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect.' })
      }

      if (await isPasswordPwned(input.newPassword, { userId: ctx.user.id, ip: ctx.ip })) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This password has appeared in a known data breach. Please choose a different password.' })
      }

      await db.update(accountsTable).set({ password: await bcrypt.hash(input.newPassword, 10) }).where(eq(accountsTable.userId, ctx.user.id))
      await audit({ userId: ctx.user.id, event: 'password_changed', ip: ctx.ip })
      await sessionPool.query(`DELETE FROM session WHERE sess->'user'->>'id' = $1`, [String(ctx.user.id)])
      return { ok: true }
    }),
})
