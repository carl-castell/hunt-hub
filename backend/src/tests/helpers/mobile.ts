import request from 'supertest'
import bcrypt from 'bcrypt'
import app from '@/app'
import { db } from '@/db'
import { accountsTable, estatesTable, usersTable } from '@/db/schema'

export const TRPC = '/api/v1/trpc'
export const PASSWORD = 'MobilePass123!'

export async function createEstate(name: string) {
  const [estate] = await db.insert(estatesTable).values({ name }).returning()
  return estate
}

export async function createUserWithAccount(opts: {
  email: string
  role: 'admin' | 'manager' | 'staff' | 'guest'
  estateId: number | null
  active?: boolean
}) {
  const [user] = await db.insert(usersTable).values({
    firstName: 'Mobile', lastName: opts.role, role: opts.role, estateId: opts.estateId,
  }).returning()
  await db.insert(accountsTable).values({
    userId: user.id,
    email: opts.email,
    password: await bcrypt.hash(PASSWORD, 4),
    active: opts.active ?? true,
  })
  return user
}

/** POST a tRPC mutation (non-batched). */
export function trpcMutation(path: string, input: unknown, token?: string) {
  const req = request(app).post(`${TRPC}/${path}`).send((input ?? {}) as object)
  return token ? req.set('Authorization', `Bearer ${token}`) : req
}

/** GET a tRPC query (non-batched). */
export function trpcQuery(path: string, input: unknown, token?: string) {
  const req = request(app).get(`${TRPC}/${path}`).query({ input: JSON.stringify(input) })
  return token ? req.set('Authorization', `Bearer ${token}`) : req
}

export async function mobileLogin(email: string, password = PASSWORD) {
  const res = await trpcMutation('mobile.auth.login', { email, password, deviceName: 'test-phone' })
  return res
}

/** Removes test users (accounts, mobile sessions and sync mutations cascade) and their estates. */
export async function cleanupMobileTestData(emails: string[], estateNames: string[]) {
  const { inArray } = await import('drizzle-orm')
  const { areasTable, auditLogsTable } = await import('@/db/schema')
  const accounts = await db.select({ userId: accountsTable.userId }).from(accountsTable)
    .where(inArray(accountsTable.email, emails))
  const userIds = accounts.map(a => a.userId)
  if (userIds.length) {
    await db.delete(auditLogsTable).where(inArray(auditLogsTable.userId, userIds))
    await db.delete(usersTable).where(inArray(usersTable.id, userIds))
  }
  const estates = await db.select({ id: estatesTable.id }).from(estatesTable)
    .where(inArray(estatesTable.name, estateNames))
  const estateIds = estates.map(e => e.id)
  if (estateIds.length) {
    await db.delete(areasTable).where(inArray(areasTable.estateId, estateIds))
    await db.delete(usersTable).where(inArray(usersTable.estateId, estateIds))
    await db.delete(estatesTable).where(inArray(estatesTable.id, estateIds))
  }
}
