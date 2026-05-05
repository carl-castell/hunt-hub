import crypto from 'crypto'
import { TRPCError } from '@trpc/server'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { estatesTable } from '@/db/schema/estates'
import { usersTable } from '@/db/schema/users'
import { accountsTable } from '@/db/schema/accounts'
import { userAuthTokensTable } from '@/db/schema'
import { createEstateSchema, addManagerSchema } from '@/schemas'
import { audit } from '@/services/audit'
import { renderTemplate, sendMail } from '@/services/mail'
import { getBaseUrl } from '@/utils/url'
import { logError } from '@/utils/logError'
import { adminProcedure, router } from '../../trpc'

export const adminEstatesRouter = router({
  list: adminProcedure.query(async () => {
    return db.select().from(estatesTable).orderBy(estatesTable.name)
  }),

  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [estate] = await db.select().from(estatesTable).where(eq(estatesTable.id, input.id)).limit(1)
      if (!estate) throw new TRPCError({ code: 'NOT_FOUND', message: 'Estate not found.' })
      const managers = await db
        .select({
          id:        usersTable.id,
          firstName: usersTable.firstName,
          lastName:  usersTable.lastName,
          role:      usersTable.role,
          email:     accountsTable.email,
          active:    accountsTable.active,
        })
        .from(usersTable)
        .innerJoin(accountsTable, eq(accountsTable.userId, usersTable.id))
        .where(and(eq(usersTable.estateId, input.id), inArray(usersTable.role, ['manager', 'staff'])))
      return { estate, managers }
    }),

  create: adminProcedure
    .input(createEstateSchema)
    .mutation(async ({ input, ctx }) => {
      const [estate] = await db.insert(estatesTable).values({ name: input.name }).returning()
      await audit({ userId: ctx.user.id, event: 'estate_created', ip: ctx.ip, metadata: { estateId: estate.id, name: estate.name } })
      return estate
    }),

  rename: adminProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1).max(256) }))
    .mutation(async ({ input, ctx }) => {
      const [estate] = await db.update(estatesTable).set({ name: input.name }).where(eq(estatesTable.id, input.id)).returning()
      if (!estate) throw new TRPCError({ code: 'NOT_FOUND', message: 'Estate not found.' })
      await audit({ userId: ctx.user.id, event: 'estate_renamed', ip: ctx.ip, metadata: { estateId: input.id, name: input.name } })
      return estate
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.transaction(async (tx) => {
        await tx.delete(usersTable).where(eq(usersTable.estateId, input.id))
        await tx.delete(estatesTable).where(eq(estatesTable.id, input.id))
      })
      await audit({ userId: ctx.user.id, event: 'estate_deleted', ip: ctx.ip, metadata: { estateId: input.id } })
      return { ok: true }
    }),

  addManager: adminProcedure
    .input(addManagerSchema)
    .mutation(async ({ input, ctx }) => {
      const token = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48)

      await db.transaction(async (tx) => {
        const [manager] = await tx.insert(usersTable)
          .values({ firstName: input.firstName, lastName: input.lastName, role: 'manager', estateId: input.estateId })
          .returning()
        await tx.insert(accountsTable).values({ userId: manager.id, email: input.email, password: null, active: false })
        await tx.insert(userAuthTokensTable).values({ userId: manager.id, token, type: 'activation', expiresAt })
      })

      try {
        const baseUrl = getBaseUrl(ctx.req)
        const html = await renderTemplate('activation', {
          firstName: input.firstName,
          activationLink: `${baseUrl}/activate/${token}`,
          year: new Date().getFullYear(),
          expiresAt,
        })
        await sendMail({ to: input.email, subject: 'Activate your Hunt Hub account', html })
      } catch (err) {
        logError('[email error] Failed to send activation email:', err)
      }

      return { ok: true }
    }),
})
