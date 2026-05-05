import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'

import { usersTable, userAuthTokensTable } from '@/db/schema'
import { accountsTable } from '@/db/schema/accounts'
import { audit } from '@/services/audit'
import { createAdminSchema } from '@/schemas'
import { adminProcedure, router } from '../../trpc'

export const adminSettingsRouter = router({
  listAdmins: adminProcedure.query(async () => {
    return db
      .select({
        id:        usersTable.id,
        firstName: usersTable.firstName,
        lastName:  usersTable.lastName,
        email:     accountsTable.email,
        active:    accountsTable.active,
      })
      .from(usersTable)
      .innerJoin(accountsTable, eq(accountsTable.userId, usersTable.id))
      .where(eq(usersTable.role, 'admin'))
      .orderBy(usersTable.firstName)
  }),

  createAdmin: adminProcedure
    .input(createAdminSchema)
    .mutation(async ({ input, ctx }) => {
      const token = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48)

      await db.transaction(async (tx) => {
        const [newAdmin] = await tx.insert(usersTable)
          .values({ firstName: input.firstName, lastName: input.lastName, role: 'admin' })
          .returning()
        await tx.insert(accountsTable).values({ userId: newAdmin.id, email: input.email, password: null, active: false })
        await tx.insert(userAuthTokensTable).values({ userId: newAdmin.id, token, type: 'activation', expiresAt })
      })

      await audit({ userId: ctx.user.id, event: 'user_created', ip: ctx.ip, metadata: { email: input.email, role: 'admin' } })
      return { ok: true }
    }),
})
