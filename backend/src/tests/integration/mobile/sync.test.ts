import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { randomUUID } from 'crypto'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { areasTable, standsTable, syncMutationsTable, syncTombstonesTable } from '@/db/schema'
import { registerSyncHandler, unregisterSyncHandler } from '@/sync/handlers'
import { cleanupMobileTestData, createEstate, createUserWithAccount, mobileLogin, trpcMutation, trpcQuery } from '../../helpers/mobile'

const POLY = 'MULTIPOLYGON(((10 50,10.1 50,10.1 50.1,10 50.1,10 50)))'

let estateId: number
let otherEstateId: number
let token: string
let userId: number

async function createArea(estate: number, name: string) {
  const [row] = await db.insert(areasTable)
    .values({ estateId: estate, name, geofile: sql`ST_GeomFromText(${POLY}, 4326)` as any })
    .returning({ id: areasTable.id })
  return row.id
}

async function createStand(areaId: number, number: string) {
  const [row] = await db.insert(standsTable)
    .values({ areaId, number, location: sql`ST_SetSRID(ST_MakePoint(10.05, 50.05), 4326)` as any })
    .returning({ id: standsTable.id })
  return row.id
}

/** Moves every row's updated_at into the past so deltas only show new changes. */
async function ageAllRows() {
  await db.execute(sql`UPDATE areas SET updated_at = now() - interval '1 hour'`)
  await db.execute(sql`UPDATE stands SET updated_at = now() - interval '1 hour'`)
  await db.execute(sql`UPDATE sync_tombstones SET deleted_at = now() - interval '1 hour'`)
}

const pull = async (cursor: string | null) => {
  const res = await trpcQuery('mobile.sync.pull', { cursor }, token)
  expect(res.status).toBe(200)
  return res.body.result.data as {
    full: boolean; cursor: string
    areas: Array<{ id: number; name: string; geojson: string | null }>
    stands: Array<{ id: number; areaId: number; number: string; lng: number; lat: number }>
    deleted: Array<{ entity: string; id: number }>
  }
}

const EMAILS = ['sync-staff@test.com']
const ESTATES = ['Sync Estate', 'Other Estate']

beforeAll(async () => {
  await cleanupMobileTestData(EMAILS, ESTATES)
  estateId = (await createEstate('Sync Estate')).id
  otherEstateId = (await createEstate('Other Estate')).id
  userId = (await createUserWithAccount({ email: 'sync-staff@test.com', role: 'staff', estateId })).id
  token = (await mobileLogin('sync-staff@test.com')).body.result.data.accessToken
})

afterAll(async () => {
  await cleanupMobileTestData(EMAILS, ESTATES)
  await db.delete(syncTombstonesTable)
})

describe('mobile.sync.pull', () => {
  it('requires a mobile token', async () => {
    expect((await trpcQuery('mobile.sync.pull', { cursor: null })).status).toBe(401)
  })

  it('returns a full snapshot of only the user\'s estate', async () => {
    const areaId = await createArea(estateId, 'North')
    const standId = await createStand(areaId, '7')
    const foreignArea = await createArea(otherEstateId, 'Foreign')
    await createStand(foreignArea, '1')

    const data = await pull(null)
    expect(data.full).toBe(true)
    expect(data.cursor).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/)
    expect(data.areas.map(a => a.id)).toEqual([areaId])
    expect(JSON.parse(data.areas[0].geojson!).type).toBe('MultiPolygon')
    expect(data.stands).toEqual([expect.objectContaining({ id: standId, areaId, number: '7', lng: 10.05, lat: 50.05 })])
    expect(data.deleted).toEqual([])
  })

  it('returns only changes since the cursor', async () => {
    const [area] = await db.select().from(areasTable).where(eq(areasTable.estateId, estateId))
    await ageAllRows()
    const { cursor } = await pull(null)

    const empty = await pull(cursor)
    expect(empty.full).toBe(false)
    expect(empty.areas).toEqual([])
    expect(empty.stands).toEqual([])

    // A change made by any code path (here: a plain UPDATE) bumps updated_at via the trigger.
    await db.update(areasTable).set({ name: 'North renamed' }).where(eq(areasTable.id, area.id))
    const delta = await pull(cursor)
    expect(delta.areas).toEqual([expect.objectContaining({ id: area.id, name: 'North renamed' })])
    expect(delta.stands).toEqual([])
  })

  it('reports deleted stands and areas as tombstones', async () => {
    const areaId = await createArea(estateId, 'Doomed')
    const standA = await createStand(areaId, 'A')
    const keptArea = await createArea(estateId, 'Kept')
    const standB = await createStand(keptArea, 'B')
    await ageAllRows()
    const { cursor } = await pull(null)

    await db.delete(standsTable).where(eq(standsTable.id, standB))
    await db.delete(areasTable).where(eq(areasTable.id, areaId)) // cascades to standA

    const delta = await pull(cursor)
    expect(delta.deleted).toEqual(expect.arrayContaining([
      { entity: 'stand', id: standB },
      { entity: 'area', id: areaId },
    ]))
    // Cascaded stand deletes are implied by the area tombstone.
    expect(delta.deleted).not.toContainEqual({ entity: 'stand', id: standA })
  })

  it('does not leak other estates\' deletes', async () => {
    await ageAllRows()
    const { cursor } = await pull(null)
    const foreign = await createArea(otherEstateId, 'Foreign 2')
    await db.delete(areasTable).where(eq(areasTable.id, foreign))
    expect((await pull(cursor)).deleted).toEqual([])
  })

  it('falls back to a full snapshot for a very old cursor', async () => {
    const data = await pull('2020-01-01T00:00:00.000000Z')
    expect(data.full).toBe(true)
  })

  it('rejects a malformed cursor', async () => {
    expect((await trpcQuery('mobile.sync.pull', { cursor: 'yesterday' }, token)).status).toBe(400)
  })
})

describe('mobile.sync.push', () => {
  let applied = 0

  afterEach(() => {
    unregisterSyncHandler('test.rename')
    unregisterSyncHandler('test.flaky')
  })

  const push = async (mutations: unknown[]) => {
    const res = await trpcMutation('mobile.sync.push', { mutations }, token)
    expect(res.status).toBe(200)
    return res.body.result.data as Array<{ id: string; status: string; reason?: string }>
  }
  const mutation = (type: string, payload: unknown) =>
    ({ id: randomUUID(), type, payload, createdAt: new Date().toISOString() })

  it('rejects unknown mutation types', async () => {
    const m = mutation('nope', {})
    expect(await push([m])).toEqual([{ id: m.id, status: 'rejected', reason: 'unknown_type' }])
  })

  it('applies a mutation exactly once, even when retried', async () => {
    const areaId = await createArea(estateId, 'Before')
    registerSyncHandler('test.rename', {
      payload: z.object({ areaId: z.number(), name: z.string() }),
      apply: async (tx, p) => {
        applied++
        await tx.update(areasTable).set({ name: p.name }).where(eq(areasTable.id, p.areaId))
        return { status: 'applied' }
      },
    })

    const m = mutation('test.rename', { areaId, name: 'After' })
    expect(await push([m])).toEqual([{ id: m.id, status: 'applied' }])
    expect(await push([m])).toEqual([{ id: m.id, status: 'applied' }])
    expect(applied).toBe(1)

    const [area] = await db.select().from(areasTable).where(eq(areasTable.id, areaId))
    expect(area.name).toBe('After')
  })

  it('rejects an invalid payload', async () => {
    registerSyncHandler('test.rename', { payload: z.object({ areaId: z.number() }), apply: async () => ({ status: 'applied' }) })
    const m = mutation('test.rename', { areaId: 'x' })
    expect(await push([m])).toEqual([{ id: m.id, status: 'rejected', reason: 'invalid_payload' }])
  })

  it('does not record a failed mutation, so a retry can succeed', async () => {
    let fail = true
    registerSyncHandler('test.flaky', {
      payload: z.object({}),
      apply: async () => { if (fail) throw new Error('db hiccup'); return { status: 'applied' } },
    })
    const m = mutation('test.flaky', {})
    expect(await push([m])).toEqual([{ id: m.id, status: 'error' }])
    fail = false
    expect(await push([m])).toEqual([{ id: m.id, status: 'applied' }])
  })

  it('stores mutations under the pushing user', async () => {
    const m = mutation('nope', {})
    await push([m])
    const [row] = await db.select().from(syncMutationsTable).where(eq(syncMutationsTable.id, m.id))
    expect(row.userId).toBe(userId)
  })
})
