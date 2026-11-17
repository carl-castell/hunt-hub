import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'crypto'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { areasTable, standsTable } from '@/db/schema'
import { cleanupMobileTestData, createEstate, createUserWithAccount, mobileLogin, trpcMutation, trpcQuery } from '../../helpers/mobile'
import { todayInGermany } from '@/services/stands'

// Area from (10, 50) to (10.1, 50.1); (10.05, 50.05) is inside, (11, 51) outside.
const POLY = 'MULTIPOLYGON(((10 50,10.1 50,10.1 50.1,10 50.1,10 50)))'
const EMAILS = ['edit-manager@test.com', 'edit-staff@test.com']
const ESTATES = ['Edit Estate', 'Other Edit Estate']

let managerToken: string
let staffToken: string
let areaId: number
let foreignAreaId: number

async function createArea(estateId: number, name: string) {
  const [row] = await db.insert(areasTable)
    .values({ estateId, name, geofile: sql`ST_GeomFromText(${POLY}, 4326)` as any })
    .returning({ id: areasTable.id })
  return row.id
}

async function push(type: string, payload: unknown, token = managerToken) {
  const res = await trpcMutation('mobile.sync.push', {
    mutations: [{ id: randomUUID(), type, payload, createdAt: new Date().toISOString() }],
  }, token)
  expect(res.status).toBe(200)
  const result = { ...res.body.result.data[0] }
  delete result.id
  return result as { status: string; reason?: string; data?: { id?: number; outsideArea?: boolean; details?: unknown } }
}

async function stand(id: number) {
  const [row] = await db.execute<{ number: string; lng: number; lat: number }>(sql`
    SELECT number, ST_X(location) AS lng, ST_Y(location) AS lat FROM stands WHERE id = ${id}`).then((r) => r.rows)
  return row
}

beforeAll(async () => {
  await cleanupMobileTestData(EMAILS, ESTATES)
  const estate = await createEstate('Edit Estate')
  const other = await createEstate('Other Edit Estate')
  await createUserWithAccount({ email: 'edit-manager@test.com', role: 'manager', estateId: estate.id })
  await createUserWithAccount({ email: 'edit-staff@test.com', role: 'staff', estateId: estate.id })
  managerToken = (await mobileLogin('edit-manager@test.com')).body.result.data.accessToken
  staffToken = (await mobileLogin('edit-staff@test.com')).body.result.data.accessToken
  areaId = await createArea(estate.id, 'Edit Area')
  foreignAreaId = await createArea(other.id, 'Foreign Area')
})

afterAll(async () => {
  await cleanupMobileTestData(EMAILS, ESTATES)
})

describe('stand.create', () => {
  it('creates a stand inside the area and returns its id', async () => {
    const result = await push('stand.create', { areaId, number: ' 1 ', lng: 10.05, lat: 50.05 })
    expect(result).toMatchObject({ status: 'applied', data: { outsideArea: false } })
    expect(await stand(result.data!.id!)).toEqual({ number: '1', lng: 10.05, lat: 50.05 })
  })

  it('accepts a stand outside the boundary and reports it (warning, not error)', async () => {
    const result = await push('stand.create', { areaId, number: '99', lng: 11, lat: 51 })
    expect(result).toMatchObject({ status: 'applied', data: { outsideArea: true } })
  })

  it('refuses a number that already exists in the area', async () => {
    await push('stand.create', { areaId, number: '2', lng: 10.05, lat: 50.05 })
    expect(await push('stand.create', { areaId, number: '2', lng: 10.06, lat: 50.06 }))
      .toEqual({ status: 'rejected', reason: 'number_taken' })
  })

  it('refuses areas of another estate', async () => {
    expect(await push('stand.create', { areaId: foreignAreaId, number: '1', lng: 10.05, lat: 50.05 }))
      .toEqual({ status: 'rejected', reason: 'area_not_found' })
  })

  it('refuses staff (editing is for managers)', async () => {
    expect(await push('stand.create', { areaId, number: '50', lng: 10.05, lat: 50.05 }, staffToken))
      .toEqual({ status: 'rejected', reason: 'forbidden' })
  })

  it('refuses invalid payloads (empty number, impossible coordinates)', async () => {
    expect((await push('stand.create', { areaId, number: '  ', lng: 10, lat: 50 })).reason).toBe('invalid_payload')
    expect((await push('stand.create', { areaId, number: '3', lng: 200, lat: 50 })).reason).toBe('invalid_payload')
  })

  it('creates the same number only once when two phones push at the same time', async () => {
    const results = await Promise.all([
      push('stand.create', { areaId, number: 'race', lng: 10.05, lat: 50.05 }),
      push('stand.create', { areaId, number: 'race', lng: 10.06, lat: 50.06 }),
    ])
    expect(results.map((r) => r.status).sort()).toEqual(['applied', 'rejected'])
    const rows = await db.select().from(standsTable).where(eq(standsTable.number, 'race'))
    expect(rows).toHaveLength(1)
  })
})

describe('stand.rename', () => {
  it('renames a stand', async () => {
    const { data } = await push('stand.create', { areaId, number: '10', lng: 10.05, lat: 50.05 })
    expect(await push('stand.rename', { id: data!.id, number: '10a' })).toEqual({ status: 'applied' })
    expect((await stand(data!.id!)).number).toBe('10a')
  })

  it('keeps the number unique, but allows renaming to the same number', async () => {
    const { data } = await push('stand.create', { areaId, number: '11', lng: 10.05, lat: 50.05 })
    await push('stand.create', { areaId, number: '12', lng: 10.05, lat: 50.05 })
    expect(await push('stand.rename', { id: data!.id, number: '12' })).toEqual({ status: 'rejected', reason: 'number_taken' })
    expect(await push('stand.rename', { id: data!.id, number: '11' })).toEqual({ status: 'applied' })
  })

  it('refuses stands of another estate', async () => {
    const [foreign] = await db.insert(standsTable).values({ areaId: foreignAreaId, number: 'x' }).returning({ id: standsTable.id })
    expect(await push('stand.rename', { id: foreign.id, number: 'y' })).toEqual({ status: 'rejected', reason: 'stand_not_found' })
  })
})

describe('stand.move', () => {
  it('moves a stand and reports whether it is outside the area', async () => {
    const { data } = await push('stand.create', { areaId, number: '20', lng: 10.05, lat: 50.05 })
    expect(await push('stand.move', { id: data!.id, lng: 10.07, lat: 50.08 })).toEqual({ status: 'applied', data: { outsideArea: false } })
    expect(await stand(data!.id!)).toMatchObject({ lng: 10.07, lat: 50.08 })
    expect(await push('stand.move', { id: data!.id, lng: 11, lat: 51 })).toEqual({ status: 'applied', data: { outsideArea: true } })
  })

  it('refuses unknown stands and staff', async () => {
    expect(await push('stand.move', { id: 999999999, lng: 10, lat: 50 })).toEqual({ status: 'rejected', reason: 'stand_not_found' })
    const { data } = await push('stand.create', { areaId, number: '21', lng: 10.05, lat: 50.05 })
    expect(await push('stand.move', { id: data!.id, lng: 10.06, lat: 50.06 }, staffToken)).toEqual({ status: 'rejected', reason: 'forbidden' })
  })
})

describe('stand.update (nickname and status)', () => {
  it('creates a stand with a nickname and status', async () => {
    const { status, data } = await push('stand.create', { areaId, number: '30', lng: 10.05, lat: 50.05, nickname: 'Eiche', status: 'ok' })
    expect(status).toBe('applied')
    expect(data!.details).toEqual({ nickname: 'Eiche', status: 'ok', statusDate: todayInGermany() })
  })

  it('still accepts a create without them (older app versions)', async () => {
    const { status, data } = await push('stand.create', { areaId, number: '31', lng: 10.05, lat: 50.05 })
    expect(status).toBe('applied')
    expect(data!.details).toBeUndefined()
  })

  it('changes the status and returns the date the server set', async () => {
    const { data } = await push('stand.create', { areaId, number: '32', lng: 10.05, lat: 50.05 })
    const result = await push('stand.update', { id: data!.id, status: 'needs_repair' })
    expect(result).toEqual({ status: 'applied', data: { details: { nickname: null, status: 'needs_repair', statusDate: todayInGermany() } } })
  })

  it('sends the new fields with the next pull', async () => {
    const { data } = await push('stand.create', { areaId, number: '33', lng: 10.05, lat: 50.05 })
    await push('stand.update', { id: data!.id, nickname: 'Am Bach', status: 'broken', statusDate: '2026-11-02' })
    const res = await trpcQuery('mobile.sync.pull', { cursor: null }, managerToken)
    const pulled = res.body.result.data.stands.find((s: { id: number }) => s.id === data!.id)
    expect(pulled).toMatchObject({ nickname: 'Am Bach', status: 'broken', statusDate: '2026-11-02' })
  })

  it('rejects unknown statuses, foreign stands and staff', async () => {
    const { data } = await push('stand.create', { areaId, number: '34', lng: 10.05, lat: 50.05 })
    expect(await push('stand.update', { id: data!.id, status: 'fine' })).toEqual({ status: 'rejected', reason: 'invalid_payload' })
    expect(await push('stand.update', { id: 999999999, status: 'ok' })).toEqual({ status: 'rejected', reason: 'stand_not_found' })
    expect(await push('stand.update', { id: data!.id, status: 'ok' }, staffToken)).toEqual({ status: 'rejected', reason: 'forbidden' })
  })
})
