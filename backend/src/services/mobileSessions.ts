import crypto from 'crypto'
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { db } from '@/db'
import { mobileSessionsTable } from '@/db/schema/mobile_sessions'
import { usersTable } from '@/db/schema/users'
import { accountsTable } from '@/db/schema/accounts'

export const ACCESS_TTL_MS = 60 * 60 * 1000             // 1 hour
export const REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000  // 60 days, extended on every refresh

export type MobileTokens = {
  accessToken: string
  refreshToken: string
  accessExpiresAt: Date
  refreshExpiresAt: Date
}

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex')
const newToken = () => crypto.randomBytes(32).toString('base64url')

function issuePair(now = Date.now()) {
  const accessToken = newToken()
  const refreshToken = newToken()
  return {
    tokens: {
      accessToken,
      refreshToken,
      accessExpiresAt: new Date(now + ACCESS_TTL_MS),
      refreshExpiresAt: new Date(now + REFRESH_TTL_MS),
    } satisfies MobileTokens,
    hashes: { accessTokenHash: hashToken(accessToken), refreshTokenHash: hashToken(refreshToken) },
  }
}

export async function createMobileSession(userId: number, deviceName?: string | null) {
  const { tokens, hashes } = issuePair()
  const [row] = await db.insert(mobileSessionsTable).values({
    userId,
    deviceName: deviceName ?? null,
    ...hashes,
    accessExpiresAt: tokens.accessExpiresAt,
    refreshExpiresAt: tokens.refreshExpiresAt,
  }).returning({ id: mobileSessionsTable.id })
  return { sessionId: row.id, ...tokens }
}

/**
 * Exchanges a refresh token for a new token pair (rotation).
 * The previous refresh token is also accepted until the new pair has been used,
 * which covers a refresh response that never reached the device.
 * Returns null if the token is unknown, expired or revoked.
 */
export async function refreshMobileSession(refreshToken: string) {
  const hash = hashToken(refreshToken)
  const now = new Date()
  const [session] = await db.select().from(mobileSessionsTable).where(and(
    or(eq(mobileSessionsTable.refreshTokenHash, hash), eq(mobileSessionsTable.prevRefreshTokenHash, hash)),
    isNull(mobileSessionsTable.revokedAt),
    gt(mobileSessionsTable.refreshExpiresAt, now),
  )).limit(1)
  if (!session) return null

  const { tokens, hashes } = issuePair(now.getTime())
  // When the client retries with the previous token, keep that one as the fallback;
  // otherwise the token just presented becomes the fallback.
  const prev = session.prevRefreshTokenHash === hash ? hash : session.refreshTokenHash
  await db.update(mobileSessionsTable).set({
    ...hashes,
    prevRefreshTokenHash: prev,
    accessExpiresAt: tokens.accessExpiresAt,
    refreshExpiresAt: tokens.refreshExpiresAt,
    lastUsedAt: now,
  }).where(eq(mobileSessionsTable.id, session.id))

  return { sessionId: session.id, userId: session.userId, ...tokens }
}

/** Resolves a Bearer access token to its session and current user, or null. */
export async function resolveAccessToken(accessToken: string) {
  const now = new Date()
  const [row] = await db
    .select({ session: mobileSessionsTable, user: usersTable, account: accountsTable })
    .from(mobileSessionsTable)
    .innerJoin(usersTable, eq(mobileSessionsTable.userId, usersTable.id))
    .innerJoin(accountsTable, eq(accountsTable.userId, usersTable.id))
    .where(and(
      eq(mobileSessionsTable.accessTokenHash, hashToken(accessToken)),
      isNull(mobileSessionsTable.revokedAt),
      gt(mobileSessionsTable.accessExpiresAt, now),
    ))
    .limit(1)
  if (!row || !row.account.active) return null

  // The new pair is in use, so the old refresh token is no longer needed.
  // lastUsedAt is only written at most once a minute to avoid a write per request.
  if (row.session.prevRefreshTokenHash || now.getTime() - row.session.lastUsedAt.getTime() > 60_000) {
    await db.update(mobileSessionsTable)
      .set({ prevRefreshTokenHash: null, lastUsedAt: now })
      .where(eq(mobileSessionsTable.id, row.session.id))
  }

  return { sessionId: row.session.id, user: toSessionUser(row.user, row.account) }
}

/** Loads the current user for a session without touching the session itself. */
export async function loadActiveUser(userId: number) {
  const [row] = await db
    .select({ user: usersTable, account: accountsTable })
    .from(usersTable)
    .innerJoin(accountsTable, eq(accountsTable.userId, usersTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1)
  if (!row || !row.account.active) return null
  return toSessionUser(row.user, row.account)
}

function toSessionUser(
  user: typeof usersTable.$inferSelect,
  account: typeof accountsTable.$inferSelect,
): SessionUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: account.email,
    role: user.role,
    active: account.active,
    estateId: user.estateId ?? null,
  }
}

export async function revokeMobileSession(sessionId: string) {
  await db.update(mobileSessionsTable)
    .set({ revokedAt: new Date() })
    .where(eq(mobileSessionsTable.id, sessionId))
}
