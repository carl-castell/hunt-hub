import crypto from 'crypto'
import { TRPCError } from '@trpc/server'
import bcrypt from 'bcrypt'
import { and, eq, isNull } from 'drizzle-orm'
import { TOTP, Secret } from 'otpauth'
import QRCode from 'qrcode'
import { z } from 'zod'
import { db } from '@/db'
import { usersTable } from '@/db/schema/users'
import { accountsTable } from '@/db/schema/accounts'
import { totpBackupCodesTable } from '@/db/schema/totp_backup_codes'
import { loginSchema } from '@/schemas'
import { audit } from '@/services/audit'
import { publicProcedure, protectedProcedure, router } from '../trpc'
import type { Context } from '../context'

function checkToken(token: string, secret: string): boolean {
  return new TOTP({ secret: Secret.fromBase32(secret) }).validate({ token: token.trim() }) !== null
}

function generateBackupCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const hex = crypto.randomBytes(6).toString('hex').toUpperCase()
    return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8)}`
  })
}

function requirePending(ctx: Context): number {
  const { pendingAdminId, pendingAdminExpires } = ctx.session
  if (!pendingAdminId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No pending TOTP session.' })
  if (pendingAdminExpires && Date.now() > pendingAdminExpires) {
    ctx.session.pendingAdminId = undefined
    ctx.session.pendingAdminExpires = undefined
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'TOTP session expired. Please log in again.' })
  }
  return pendingAdminId
}

async function completeAdminLogin(ctx: Context, userId: number): Promise<SessionUser> {
  const [row] = await db
    .select()
    .from(accountsTable)
    .innerJoin(usersTable, eq(accountsTable.userId, usersTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1)
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' })
  const { accounts: account, users: user } = row
  const sessionUser: SessionUser = {
    id: user.id, firstName: user.firstName, lastName: user.lastName,
    email: account.email, role: user.role, active: account.active, estateId: user.estateId ?? null,
  }
  await new Promise<void>((resolve, reject) => {
    ctx.req.session.regenerate((err) => {
      if (err) return reject(err)
      ctx.req.session.user = sessionUser
      ctx.req.session.save((saveErr) => saveErr ? reject(saveErr) : resolve())
    })
  })
  await audit({ userId: user.id, event: 'login', ip: ctx.ip })
  return sessionUser
}

export const authRouter = router({
  me: publicProcedure.query(({ ctx }): SessionUser | null => {
    return ctx.user ?? null
  }),

  login: publicProcedure
    .input(loginSchema)
    .mutation(async ({ input, ctx }) => {
      const { email, password } = input

      const [row] = await db
        .select()
        .from(accountsTable)
        .innerJoin(usersTable, eq(accountsTable.userId, usersTable.id))
        .where(eq(accountsTable.email, email))
        .limit(1)

      if (!row) {
        await audit({ event: 'failed_login', ip: ctx.ip, metadata: { email } })
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password.' })
      }

      const { accounts: account, users: user } = row

      if (!account.active || !account.password) {
        await audit({ event: 'failed_login', ip: ctx.ip, metadata: { email } })
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
        const locked = newCount >= 10
        await db.update(accountsTable).set({
          failedAttempts: newCount,
          lockedUntil: locked ? new Date(Date.now() + 15 * 60 * 1000) : null,
        }).where(eq(accountsTable.userId, account.userId))
        await audit({ event: 'failed_login', ip: ctx.ip, metadata: { email } })
        if (locked) await audit({ userId: account.userId, event: 'account_locked', ip: ctx.ip, metadata: { reason: 'password' } })
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password.' })
      }

      if (account.failedAttempts > 0 || account.lockedUntil) {
        await db.update(accountsTable).set({ failedAttempts: 0, lockedUntil: null }).where(eq(accountsTable.userId, account.userId))
      }

      // Admin accounts require TOTP as a second factor
      if (user.role === 'admin' && process.env.SKIP_TOTP !== 'true') {
        await new Promise<void>((resolve, reject) => {
          ctx.req.session.regenerate((err) => {
            if (err) return reject(err)
            ctx.req.session.pendingAdminId = user.id
            ctx.req.session.pendingAdminExpires = Date.now() + 5 * 60 * 1000
            ctx.req.session.save((saveErr) => saveErr ? reject(saveErr) : resolve())
          })
        })
        return { requiresTotp: true as const, user: null }
      }

      const sessionUser: SessionUser = {
        id:        user.id,
        firstName: user.firstName,
        lastName:  user.lastName,
        email:     account.email,
        role:      user.role,
        active:    account.active,
        estateId:  user.estateId ?? null,
      }
      await new Promise<void>((resolve, reject) => {
        ctx.req.session.regenerate((err) => {
          if (err) return reject(err)
          ctx.req.session.user = sessionUser
          ctx.req.session.save((saveErr) => saveErr ? reject(saveErr) : resolve())
        })
      })

      await audit({ userId: user.id, event: 'login', ip: ctx.ip })
      return { requiresTotp: false as const, user: sessionUser }
    }),

  checkPendingTotp: publicProcedure.query(async ({ ctx }) => {
    const userId = requirePending(ctx)
    const [row] = await db.select({ totpSecret: accountsTable.totpSecret })
      .from(accountsTable).where(eq(accountsTable.userId, userId)).limit(1)
    return { needsSetup: !row?.totpSecret }
  }),

  verifyTotp: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const userId = requirePending(ctx)
      const [row] = await db.select({ totpSecret: accountsTable.totpSecret })
        .from(accountsTable).where(eq(accountsTable.userId, userId)).limit(1)
      if (!row?.totpSecret) throw new TRPCError({ code: 'BAD_REQUEST', message: 'TOTP not configured.' })
      if (!checkToken(input.token, row.totpSecret)) {
        await audit({ userId, event: 'failed_totp', ip: ctx.ip })
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid code. Please try again.' })
      }
      return completeAdminLogin(ctx, userId)
    }),

  beginTotpSetup: publicProcedure.mutation(async ({ ctx }) => {
    const userId = requirePending(ctx)
    const [row] = await db.select({ email: accountsTable.email })
      .from(accountsTable).where(eq(accountsTable.userId, userId)).limit(1)
    if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
    if (!ctx.session.pendingTotpSecret) {
      ctx.session.pendingTotpSecret = new Secret().base32
      await new Promise<void>((resolve, reject) => ctx.session.save(e => e ? reject(e) : resolve()))
    }
    const otpauth = new TOTP({
      issuer: 'Hunt-Hub', label: row.email,
      secret: Secret.fromBase32(ctx.session.pendingTotpSecret),
    }).toString()
    const qrDataUrl = await QRCode.toDataURL(otpauth)
    return { qrDataUrl, secret: ctx.session.pendingTotpSecret }
  }),

  confirmTotpSetup: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const userId = requirePending(ctx)
      const secret = ctx.session.pendingTotpSecret
      if (!secret) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No TOTP secret in session. Please restart setup.' })
      if (!checkToken(input.token, secret)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid code. Please scan the QR code and try again.' })
      }
      await db.update(accountsTable).set({ totpSecret: secret }).where(eq(accountsTable.userId, userId))
      const codes = generateBackupCodes()
      const hashes = await Promise.all(codes.map(c => bcrypt.hash(c.replace(/-/g, ''), 10)))
      await db.insert(totpBackupCodesTable).values(codes.map((_, i) => ({ userId, codeHash: hashes[i] })))
      await audit({ userId, event: 'totp_setup', ip: ctx.ip })
      ctx.session.pendingBackupCodes = codes
      await new Promise<void>((resolve, reject) => ctx.session.save(e => e ? reject(e) : resolve()))
      return { codes }
    }),

  getBackupCodes: publicProcedure.query(({ ctx }) => {
    requirePending(ctx)
    const codes = ctx.session.pendingBackupCodes
    if (!codes) throw new TRPCError({ code: 'NOT_FOUND', message: 'No backup codes in session.' })
    return { codes }
  }),

  confirmBackupCodesSaved: publicProcedure.mutation(async ({ ctx }) => {
    const userId = requirePending(ctx)
    if (!ctx.session.pendingBackupCodes) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No backup codes in session.' })
    return completeAdminLogin(ctx, userId)
  }),

  useBackupCode: publicProcedure
    .input(z.object({ code: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const userId = requirePending(ctx)
      const raw = input.code.trim().toUpperCase()
      const [acct] = await db
        .select({ failedAttempts: accountsTable.failedAttempts, lockedUntil: accountsTable.lockedUntil })
        .from(accountsTable).where(eq(accountsTable.userId, userId)).limit(1)
      if (!acct) throw new TRPCError({ code: 'NOT_FOUND' })
      if (acct.lockedUntil && acct.lockedUntil > new Date()) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Account temporarily locked. Please try again later.' })
      }
      if (acct.lockedUntil) {
        await db.update(accountsTable).set({ failedAttempts: 0, lockedUntil: null }).where(eq(accountsTable.userId, userId))
        acct.failedAttempts = 0
      }
      const unusedCodes = await db.select().from(totpBackupCodesTable)
        .where(and(eq(totpBackupCodesTable.userId, userId), isNull(totpBackupCodesTable.usedAt)))
      const normalized = raw.replace(/-/g, '')
      let match: typeof unusedCodes[number] | undefined
      for (const row of unusedCodes) {
        if (await bcrypt.compare(normalized, row.codeHash)) { match = row; break }
      }
      if (!match) {
        const newCount = acct.failedAttempts + 1
        const locked = newCount >= 10
        await db.update(accountsTable).set({
          failedAttempts: newCount,
          lockedUntil: locked ? new Date(Date.now() + 15 * 60 * 1000) : null,
        }).where(eq(accountsTable.userId, userId))
        await audit({ userId, event: 'failed_backup_code', ip: ctx.ip })
        if (locked) await audit({ userId, event: 'account_locked', ip: ctx.ip, metadata: { reason: 'backup_code' } })
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid or already used backup code.' })
      }
      await db.update(accountsTable).set({ failedAttempts: 0, lockedUntil: null }).where(eq(accountsTable.userId, userId))
      await audit({ userId, event: 'backup_code_used', ip: ctx.ip })
      await db.update(totpBackupCodesTable).set({ usedAt: new Date() }).where(eq(totpBackupCodesTable.id, match.id))
      await db.update(accountsTable).set({ totpSecret: null }).where(eq(accountsTable.userId, userId))
      await db.delete(totpBackupCodesTable).where(eq(totpBackupCodesTable.userId, userId))
      ctx.session.pendingTotpSecret = undefined
      await new Promise<void>((resolve, reject) => ctx.session.save(e => e ? reject(e) : resolve()))
      return { mustSetup: true }
    }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id
    const ip = ctx.ip
    await new Promise<void>((resolve) => {
      ctx.session.destroy(async () => {
        await audit({ userId, event: 'logout', ip })
        resolve()
      })
    })
    return { ok: true }
  }),
})
