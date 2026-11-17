import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { eq, sql } from 'drizzle-orm'
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
let foreignAreaId: number

const call = (procedure: string, input: unknown) => agent.post(`${TRPC}/manager.stands.${procedure}`).send(input as object)
const update = (input: unknown) => call('update', input)
const getArea = () => agent.get(`${TRPC}/manager.areas.get`).query({ input: JSON.stringify({ id: areaId }) })

beforeAll(async () => {
  await cleanupMobileTestData(EMAILS, ESTATES)
  const estate = await createEstate('Stands API Estate')
  const other = await createEstate('Stands API Other Estate')
  areaId = (await db.insert(areasTable).values({
    name: 'North', estateId: estate.id,
    // From (10, 50) to (10.1, 50.1).
    geofile: sql`ST_GeomFromText('MULTIPOLYGON(((10 50,10.1 50,10.1 50.1,10 50.1,10 50)))', 4326)` as never,
  }).returning())[0].id
  foreignAreaId = (await db.insert(areasTable).values({ name: 'Theirs', estateId: other.id }).returning())[0].id
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

describe('manager.stands: add, rename, move, delete', () => {
  const inside = { lng: 10.05, lat: 50.05 }
  const outside = { lng: 11, lat: 51 }

  it('adds a stand with a number, nickname and status', async () => {
    const res = await call('create', { areaId, number: ' 7 ', position: inside, nickname: 'Eiche', status: 'ok' })
    expect(res.status).toBe(200)
    expect(res.body.result.data).toMatchObject({ number: '7', outsideArea: false, details: { nickname: 'Eiche', status: 'ok' } })
  })

  it('numbers stands without a number as NOT-NAMED-1, NOT-NAMED-2, …', async () => {
    const first = await call('create', { areaId, position: inside })
    const second = await call('create', { areaId, number: '  ', position: inside })
    expect(first.body.result.data.number).toBe('NOT-NAMED-1')
    expect(second.body.result.data.number).toBe('NOT-NAMED-2')
  })

  it('refuses a number that already exists in the area', async () => {
    const res = await call('create', { areaId, number: '7', position: inside })
    expect(res.status).toBe(409)
    expect(res.body.error.message).toBe('Stand 7 already exists in this area.')
  })

  it('accepts a stand outside the boundary and says so', async () => {
    const res = await call('create', { areaId, number: '8', position: outside })
    expect(res.body.result.data.outsideArea).toBe(true)
  })

  it('renames, moves and deletes a stand', async () => {
    const created = (await call('create', { areaId, number: '9', position: inside })).body.result.data
    expect((await call('rename', { id: created.id, number: '7' })).status).toBe(409)
    expect((await call('rename', { id: created.id, number: '9a' })).status).toBe(200)
    const moved = await call('move', { id: created.id, position: outside })
    expect(moved.body.result.data).toEqual({ outsideArea: true })
    const [row] = await db.execute<{ number: string; lng: number }>(sql`SELECT number, ST_X(location) AS lng FROM stands WHERE id = ${created.id}`).then((r) => r.rows)
    expect(row).toEqual({ number: '9a', lng: 11 })

    expect((await call('delete', { id: created.id })).status).toBe(200)
    expect(await db.select().from(standsTable).where(eq(standsTable.id, created.id))).toEqual([])
  })

  it("can't touch another estate's area or stands", async () => {
    expect((await call('create', { areaId: foreignAreaId, number: '1', position: inside })).status).toBe(404)
    expect((await call('rename', { id: foreignStandId, number: '2' })).status).toBe(404)
    expect((await call('move', { id: foreignStandId, position: inside })).status).toBe(404)
    expect((await call('delete', { id: foreignStandId })).status).toBe(404)
    expect(await db.select().from(standsTable).where(eq(standsTable.id, foreignStandId))).toHaveLength(1)
  })
})
