import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import app from '@/app'
import { db } from '@/db'
import { areasTable } from '@/db/schema/areas'
import { standsTable } from '@/db/schema/stands'
import { todayInGermany } from '@/services/stands'
import { cleanupMobileTestData, createEstate, createUserWithAccount, PASSWORD, TRPC } from '../../helpers/mobile'

const EMAILS = ['sa-manager@test.com']
const ESTATES = ['Stands API Estate', 'Stands API Other Estate']

let agent: ReturnType<typeof request.agent>
let areaId: number
let standId: number
let foreignStandId: number

const update = (input: unknown) => agent.post(`${TRPC}/manager.stands.update`).send(input as object)
const getArea = () => agent.get(`${TRPC}/manager.areas.get`).query({ input: JSON.stringify({ id: areaId }) })

beforeAll(async () => {
  await cleanupMobileTestData(EMAILS, ESTATES)
  const estate = await createEstate('Stands API Estate')
  const other = await createEstate('Stands API Other Estate')
  areaId = (await db.insert(areasTable).values({ name: 'North', estateId: estate.id }).returning())[0].id
  const foreignAreaId = (await db.insert(areasTable).values({ name: 'Theirs', estateId: other.id }).returning())[0].id
  standId = (await db.insert(standsTable).values({ number: '1', areaId }).returning())[0].id
  foreignStandId = (await db.insert(standsTable).values({ number: '1', areaId: foreignAreaId }).returning())[0].id

  await createUserWithAccount({ email: 'sa-manager@test.com', role: 'manager', estateId: estate.id })
  agent = request.agent(app)
  await agent.post(`${TRPC}/auth.login`).send({ email: 'sa-manager@test.com', password: PASSWORD })
})

afterAll(async () => {
  await cleanupMobileTestData(EMAILS, ESTATES)
})

describe('manager.stands.update', () => {
  it('sets nickname and status; the status date becomes today', async () => {
    const res = await update({ id: standId, nickname: ' Eiche ', status: 'broken' })
    expect(res.status).toBe(200)
    expect(res.body.result.data).toEqual({ id: standId, nickname: 'Eiche', status: 'broken', statusDate: todayInGermany() })
  })

  it('returns the new fields with the area', async () => {
    const stand = (await getArea()).body.result.data.stands[0]
    expect(stand).toMatchObject({ id: standId, nickname: 'Eiche', status: 'broken', statusDate: todayInGermany() })
  })

  it('keeps fields that are not sent and accepts a corrected date', async () => {
    const res = await update({ id: standId, statusDate: '2026-11-01' })
    expect(res.body.result.data).toMatchObject({ nickname: 'Eiche', status: 'broken', statusDate: '2026-11-01' })
  })

  it('clears status and date together', async () => {
    const res = await update({ id: standId, status: null, nickname: '' })
    expect(res.body.result.data).toMatchObject({ nickname: null, status: null, statusDate: null })
    const [row] = await db.select().from(standsTable).where(eq(standsTable.id, standId))
    expect(row).toMatchObject({ nickname: null, status: null, statusDate: null })
  })

  it('refuses an unknown status', async () => {
    expect((await update({ id: standId, status: 'fine' })).status).toBe(400)
  })

  it("does not change another estate's stand", async () => {
    expect((await update({ id: foreignStandId, status: 'ok' })).status).toBe(404)
    const [row] = await db.select().from(standsTable).where(eq(standsTable.id, foreignStandId))
    expect(row.status).toBeNull()
  })
})
