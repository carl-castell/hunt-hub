import { TRPCError } from '@trpc/server'
import bcrypt from 'bcrypt'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { usersTable } from '@/db/schema/users'
import { accountsTable } from '@/db/schema/accounts'
import { audit } from '@/services/audit'

const MAX_FAILED_ATTEMPTS = 10
const LOCK_MS = 15 * 60 * 1000

/**
 * Checks email + password, including the inactive-account and lockout rules.
 * Shared by the web (session) login and the mobile (token) login.
 * Throws a TRPCError on failure; returns the joined account and user rows on success.
 */
export async function verifyCredentials(email: string, password: string, ip: string) {
  const [row] = await db
    .select()
    .from(accountsTable)
    .innerJoin(usersTable, eq(accountsTable.userId, usersTable.id))
    .where(eq(accountsTable.email, email))
    .limit(1)

  if (!row) {
    await audit({ event: 'failed_login', ip, metadata: { email } })
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password.' })
  }

  const { accounts: account, users: user } = row

  if (!account.active || !account.password) {
    await audit({ event: 'failed_login', ip, metadata: { email } })
    throw new TRPCError({ code: 'UNAUTHORIZED', message: !account.active ? 'Your account is inactive. Please reach out to management or an admin.' : 'Invalid email or password.' })
  }

  if (account.lockedUntil && account.lockedUntil > new Date()) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Account temporarily locked. Please try again later.' })
  }

  if (account.lockedUntil) {
    await db.update(accountsTable).set({ failedAttempts: 0, lockedUntil: null }).where(eq(accountsTable.userId, account.userId))
    account.failedAttempts = 0
  }

  const passwordMatch = await bcrypt.compare(password, account.password)
  if (!passwordMatch) {
    const newCount = account.failedAttempts + 1
    const locked = newCount >= MAX_FAILED_ATTEMPTS
    await db.update(accountsTable).set({
      failedAttempts: newCount,
      lockedUntil: locked ? new Date(Date.now() + LOCK_MS) : null,
    }).where(eq(accountsTable.userId, account.userId))
    await audit({ event: 'failed_login', ip, metadata: { email } })
    if (locked) await audit({ userId: account.userId, event: 'account_locked', ip, metadata: { reason: 'password' } })
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password.' })
  }

  if (account.failedAttempts > 0 || account.lockedUntil) {
    await db.update(accountsTable).set({ failedAttempts: 0, lockedUntil: null }).where(eq(accountsTable.userId, account.userId))
  }

  return { account, user }
}
