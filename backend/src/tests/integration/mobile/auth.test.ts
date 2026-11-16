import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { accountsTable, mobileSessionsTable } from '@/db/schema'
import {
  cleanupMobileTestData, createEstate, createUserWithAccount, mobileLogin, trpcMutation, trpcQuery, PASSWORD,
} from '../../helpers/mobile'

let estateId: number
let managerId: number
let staffId: number

const EMAILS = ['m-manager@test.com', 'm-staff@test.com', 'm-guest@test.com', 'm-admin@test.com',
  'm-locked@test.com', 'm-inactive@test.com', 'm-deact@test.com']
const ESTATES = ['Mobile Auth Estate']

afterAll(() => cleanupMobileTestData(EMAILS, ESTATES))

beforeAll(async () => {
  await cleanupMobileTestData(EMAILS, ESTATES)
  const estate = await createEstate('Mobile Auth Estate')
  estateId = estate.id
  managerId = (await createUserWithAccount({ email: 'm-manager@test.com', role: 'manager', estateId })).id
  staffId = (await createUserWithAccount({ email: 'm-staff@test.com', role: 'staff', estateId })).id
  await createUserWithAccount({ email: 'm-guest@test.com', role: 'guest', estateId })
  await createUserWithAccount({ email: 'm-admin@test.com', role: 'admin', estateId: null })
  await createUserWithAccount({ email: 'm-locked@test.com', role: 'staff', estateId })
  await createUserWithAccount({ email: 'm-inactive@test.com', role: 'staff', estateId, active: false })
})

describe('mobile.auth.login', () => {
  it('logs in a manager and returns tokens and the user', async () => {
    const res = await mobileLogin('m-manager@test.com')
    expect(res.status).toBe(200)
    const data = res.body.result.data
    expect(data.user).toMatchObject({ id: managerId, role: 'manager', estateId })
    expect(data.accessToken).toEqual(expect.any(String))
    expect(data.refreshToken).toEqual(expect.any(String))
    expect(new Date(data.refreshExpiresAt).getTime()).toBeGreaterThan(Date.now() + 59 * 24 * 3600 * 1000)
  })

  it('logs in staff', async () => {
    const res = await mobileLogin('m-staff@test.com')
    expect(res.status).toBe(200)
    expect(res.body.result.data.user.id).toBe(staffId)
  })

  it('stores only token hashes', async () => {
    const res = await mobileLogin('m-staff@test.com')
    const { accessToken, refreshToken } = res.body.result.data
    const rows = await db.select().from(mobileSessionsTable).where(eq(mobileSessionsTable.userId, staffId))
    for (const row of rows) {
      expect(row.accessTokenHash).not.toBe(accessToken)
      expect(row.refreshTokenHash).not.toBe(refreshToken)
    }
  })

  it.each(['m-guest@test.com', 'm-admin@test.com'])('refuses %s (not a field role)', async (email) => {
    const res = await mobileLogin(email)
    expect(res.status).toBe(403)
  })

  it('refuses a wrong password', async () => {
    const res = await mobileLogin('m-manager@test.com', 'wrong')
    expect(res.status).toBe(401)
  })

  it('refuses an inactive account', async () => {
    const res = await mobileLogin('m-inactive@test.com')
    expect(res.status).toBe(401)
  })

  it('locks the account after 10 wrong passwords', async () => {
    for (let i = 0; i < 10; i++) await mobileLogin('m-locked@test.com', 'wrong')
    const res = await mobileLogin('m-locked@test.com', PASSWORD)
    expect(res.status).toBe(429)
  })
})

describe('mobile session tokens', () => {
  async function login() {
    return (await mobileLogin('m-manager@test.com')).body.result.data
  }

  it('me works with the access token and fails without it', async () => {
    const { accessToken } = await login()
    const ok = await trpcQuery('mobile.auth.me', undefined, accessToken)
    expect(ok.status).toBe(200)
    expect(ok.body.result.data.id).toBe(managerId)

    expect((await trpcQuery('mobile.auth.me', undefined)).status).toBe(401)
    expect((await trpcQuery('mobile.auth.me', undefined, 'garbage')).status).toBe(401)
  })

  it('does not let a mobile token reach cookie-based procedures', async () => {
    const { accessToken } = await login()
    const res = await trpcQuery('auth.me', undefined, accessToken)
    expect(res.body.result.data).toBeNull()
  })

  it('rejects an expired access token', async () => {
    const { accessToken } = await login()
    await db.update(mobileSessionsTable)
      .set({ accessExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(mobileSessionsTable.userId, managerId))
    expect((await trpcQuery('mobile.auth.me', undefined, accessToken)).status).toBe(401)
  })

  it('refresh rotates tokens; the new pair works', async () => {
    const first = await login()
    const res = await trpcMutation('mobile.auth.refresh', { refreshToken: first.refreshToken })
    expect(res.status).toBe(200)
    const second = res.body.result.data
    expect(second.refreshToken).not.toBe(first.refreshToken)
    expect(second.accessToken).not.toBe(first.accessToken)
    expect((await trpcQuery('mobile.auth.me', undefined, second.accessToken)).status).toBe(200)
    // Old access token is replaced.
    expect((await trpcQuery('mobile.auth.me', undefined, first.accessToken)).status).toBe(401)
  })

  it('accepts the previous refresh token until the new pair is used (lost response)', async () => {
    const first = await login()
    const lost = (await trpcMutation('mobile.auth.refresh', { refreshToken: first.refreshToken })).body.result.data
    // Device never saw `lost` and retries with the old token.
    const retry = await trpcMutation('mobile.auth.refresh', { refreshToken: first.refreshToken })
    expect(retry.status).toBe(200)
    const current = retry.body.result.data
    // The response that never arrived is no longer valid.
    expect((await trpcQuery('mobile.auth.me', undefined, lost.accessToken)).status).toBe(401)
    // Using the new pair retires the old refresh token.
    expect((await trpcQuery('mobile.auth.me', undefined, current.accessToken)).status).toBe(200)
    expect((await trpcMutation('mobile.auth.refresh', { refreshToken: first.refreshToken })).status).toBe(401)
    expect((await trpcMutation('mobile.auth.refresh', { refreshToken: current.refreshToken })).status).toBe(200)
  })

  it('refuses an unknown refresh token', async () => {
    expect((await trpcMutation('mobile.auth.refresh', { refreshToken: 'nope' })).status).toBe(401)
  })

  it('refresh fails once the account is deactivated', async () => {
    const user = await createUserWithAccount({ email: 'm-deact@test.com', role: 'staff', estateId })
    const { refreshToken, accessToken } = (await mobileLogin('m-deact@test.com')).body.result.data
    await db.update(accountsTable).set({ active: false }).where(eq(accountsTable.userId, user.id))
    expect((await trpcQuery('mobile.auth.me', undefined, accessToken)).status).toBe(401)
    expect((await trpcMutation('mobile.auth.refresh', { refreshToken })).status).toBe(401)
  })

  it('logout revokes the session', async () => {
    const { accessToken, refreshToken } = await login()
    expect((await trpcMutation('mobile.auth.logout', undefined, accessToken)).status).toBe(200)
    expect((await trpcQuery('mobile.auth.me', undefined, accessToken)).status).toBe(401)
    expect((await trpcMutation('mobile.auth.refresh', { refreshToken })).status).toBe(401)
  })
})
