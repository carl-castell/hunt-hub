import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import app from '@/app'
import { db } from '@/db'
import { accountsTable } from '@/db/schema'
import { areasTable } from '@/db/schema/areas'
import {
  cleanupMobileTestData, createEstate, createUserWithAccount, PASSWORD, TRPC,
} from '../../helpers/mobile'

const EMAILS = ['ma-manager@test.com', 'ma-staff@test.com', 'ma-other@test.com']
const ESTATES = ['Manager API Estate', 'Manager API Other Estate']

let estateId: number

/** Logs in through the web login (session cookie) and returns a cookie-keeping agent. */
async function loginAs(email: string) {
  const agent = request.agent(app)
  const res = await agent.post(`${TRPC}/auth.login`).send({ email, password: PASSWORD })
  expect(res.status).toBe(200)
  return agent
}

beforeAll(async () => {
  await cleanupMobileTestData(EMAILS, ESTATES)
  const estate = await createEstate('Manager API Estate')
  estateId = estate.id
  const other = await createEstate('Manager API Other Estate')
  await db.insert(areasTable).values([
    { name: 'North', estateId },
    { name: 'South', estateId },
    { name: 'Not mine', estateId: other.id },
  ])
  await createUserWithAccount({ email: 'ma-manager@test.com', role: 'manager', estateId })
  await createUserWithAccount({ email: 'ma-staff@test.com', role: 'staff', estateId })
})

afterAll(() => cleanupMobileTestData(EMAILS, ESTATES))

describe('manager.estate.get (real database)', () => {
  it("returns the manager's estate and counts only its own areas", async () => {
    const agent = await loginAs('ma-manager@test.com')

    const res = await agent.get(`${TRPC}/manager.estate.get`)

    expect(res.status).toBe(200)
    expect(res.body.result.data).toEqual({ id: estateId, name: 'Manager API Estate', areaCount: 2 })
  })

  it('rejects requests without a session', async () => {
    const res = await request(app).get(`${TRPC}/manager.estate.get`)
    expect(res.status).toBe(401)
  })

  it('forbids staff members', async () => {
    const agent = await loginAs('ma-staff@test.com')
    const res = await agent.get(`${TRPC}/manager.estate.get`)
    expect(res.status).toBe(403)
  })

  it('forbids a manager who was deactivated after logging in', async () => {
    const agent = await loginAs('ma-manager@test.com')
    await db.update(accountsTable).set({ active: false }).where(eq(accountsTable.email, 'ma-manager@test.com'))

    const res = await agent.get(`${TRPC}/manager.estate.get`)

    expect(res.status).toBe(403)
    await db.update(accountsTable).set({ active: true }).where(eq(accountsTable.email, 'ma-manager@test.com'))
  })
})
