import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import path from 'path'
import { eq, sql } from 'drizzle-orm'
import app from '@/app'
import { db } from '@/db'
import { areasTable } from '@/db/schema/areas'
import { standsTable } from '@/db/schema/stands'
import {
  cleanupMobileTestData, createEstate, createUserWithAccount, PASSWORD, TRPC,
} from '../../helpers/mobile'

const EMAILS = ['aa-manager@test.com']
const ESTATES = ['Areas API Estate', 'Areas API Other Estate']
const SAMPLE_GEOJSON = path.join(__dirname, '../../fixtures/sample.geojson')

let agent: ReturnType<typeof request.agent>
let estateId: number
let northId: number
let otherAreaId: number

const query = (procedure: string, input?: unknown) =>
  agent.get(`${TRPC}/${procedure}`).query(input === undefined ? {} : { input: JSON.stringify(input) })

const mutate = (procedure: string, input: unknown) =>
  agent.post(`${TRPC}/${procedure}`).send(input as object)

const upload = (areaId: number | string, file: { path: string } | { buffer: Buffer; name: string }, crs?: string) => {
  let req = agent.post(`${TRPC}/manager.areas.uploadBoundary`).field('areaId', String(areaId))
  if (crs !== undefined) req = req.field('crs', crs)
  return 'path' in file ? req.attach('file', file.path) : req.attach('file', file.buffer, file.name)
}

beforeAll(async () => {
  await cleanupMobileTestData(EMAILS, ESTATES)
  estateId = (await createEstate('Areas API Estate')).id
  const other = await createEstate('Areas API Other Estate')

  const [north] = await db.insert(areasTable).values({ name: 'North', estateId }).returning()
  northId = north.id
  await db.insert(areasTable).values({ name: 'Bog', estateId })
  otherAreaId = (await db.insert(areasTable).values({ name: 'Not mine', estateId: other.id }).returning())[0].id
  await db.insert(standsTable).values([
    { number: '10', areaId: northId, location: sql`ST_SetSRID(ST_MakePoint(13.4, 52.5), 4326)` },
    { number: '2', areaId: northId },
  ])

  await createUserWithAccount({ email: 'aa-manager@test.com', role: 'manager', estateId })
  agent = request.agent(app)
  await agent.post(`${TRPC}/auth.login`).send({ email: 'aa-manager@test.com', password: PASSWORD })
})

afterAll(() => cleanupMobileTestData(EMAILS, ESTATES))

describe('manager.areas.list', () => {
  it('lists only the own estate\'s areas, sorted by name, with stand counts', async () => {
    const res = await query('manager.areas.list')

    expect(res.status).toBe(200)
    expect(res.body.result.data).toEqual([
      { id: expect.any(Number), name: 'Bog', estateId, standCount: 0, hasBoundary: false },
      { id: northId, name: 'North', estateId, standCount: 2, hasBoundary: false },
    ])
  })
})

describe('manager.areas.get', () => {
  it('returns the area with its stands in natural number order', async () => {
    const res = await query('manager.areas.get', { id: northId })

    expect(res.status).toBe(200)
    const area = res.body.result.data
    expect(area).toMatchObject({ id: northId, name: 'North', boundary: null })
    expect(area.stands.map((s: { number: string }) => s.number)).toEqual(['2', '10'])
    expect(area.stands[1].location).toEqual({ type: 'Point', coordinates: [13.4, 52.5] })
    expect(area.stands[0].location).toBeNull()
  })

  it('returns NOT_FOUND for an area of another estate', async () => {
    const res = await query('manager.areas.get', { id: otherAreaId })
    expect(res.status).toBe(404)
  })

  it('rejects an invalid id', async () => {
    const res = await query('manager.areas.get', { id: 'abc' })
    expect(res.status).toBe(400)
  })
})

describe('manager.areas.create / rename / delete', () => {
  it('creates, renames and deletes an area', async () => {
    const created = await mutate('manager.areas.create', { name: 'Ridge' })
    expect(created.status).toBe(200)
    const id = created.body.result.data.id
    expect(created.body.result.data).toMatchObject({ name: 'Ridge', estateId })

    expect((await mutate('manager.areas.rename', { id, name: 'High Ridge' })).status).toBe(200)
    const [renamed] = await db.select().from(areasTable).where(eq(areasTable.id, id))
    expect(renamed.name).toBe('High Ridge')

    expect((await mutate('manager.areas.delete', { id, confirmName: 'High Ridge' })).status).toBe(200)
    expect(await db.select().from(areasTable).where(eq(areasTable.id, id))).toHaveLength(0)
  })

  it('rejects an empty name', async () => {
    const res = await mutate('manager.areas.create', { name: '' })
    expect(res.status).toBe(400)
  })

  it('does not delete when the confirmation name is wrong', async () => {
    const res = await mutate('manager.areas.delete', { id: northId, confirmName: 'Nort' })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe('Confirmation name does not match.')
    expect(await db.select().from(areasTable).where(eq(areasTable.id, northId))).toHaveLength(1)
  })

  it('cannot rename or delete an area of another estate', async () => {
    expect((await mutate('manager.areas.rename', { id: otherAreaId, name: 'Mine now' })).status).toBe(404)
    expect((await mutate('manager.areas.delete', { id: otherAreaId, confirmName: 'Not mine' })).status).toBe(404)
  })
})

describe('manager.areas.uploadBoundary / clearBoundary', () => {
  it('stores the boundary from an uploaded GeoJSON file', async () => {
    const res = await upload(northId, { path: SAMPLE_GEOJSON })
    expect(res.status).toBe(200)

    const area = (await query('manager.areas.get', { id: northId })).body.result.data
    expect(area.boundary.type).toBe('MultiPolygon')
  })

  // A square of about 700 m in UTM zone 32N (metres), as German forestry data often comes.
  const utmSquare = [[[596900, 5510300], [597600, 5510300], [597600, 5511100], [596900, 5511100], [596900, 5510300]]]
  const utmFile = (withCrs: boolean) => Buffer.from(JSON.stringify({
    type: 'FeatureCollection',
    ...(withCrs ? { crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::25832' } } } : {}),
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: utmSquare } }],
  }))

  it('converts a file in UTM (EPSG:25832) to longitude/latitude', async () => {
    const res = await upload(northId, { buffer: utmFile(true), name: 'forest-utm.geojson' })
    expect(res.status).toBe(200)

    const area = (await query('manager.areas.get', { id: northId })).body.result.data
    const [lng, lat] = area.boundary.coordinates[0][0][0]
    expect(lng).toBeCloseTo(10.33, 1)
    expect(lat).toBeCloseTo(49.74, 1)
  })

  it('refuses coordinates that are not longitude/latitude when the file names no coordinate system', async () => {
    const res = await upload(northId, { buffer: utmFile(false), name: 'forest-unknown.geojson' })
    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/not longitude\/latitude/)
    expect(res.body.error.message).toMatch(/EPSG code/)
  })

  it('uses the EPSG code the user enters when the file names no coordinate system', async () => {
    const res = await upload(northId, { buffer: utmFile(false), name: 'forest-unknown.geojson' }, '25832')
    expect(res.status).toBe(200)
    const area = (await query('manager.areas.get', { id: northId })).body.result.data
    expect(area.boundary.coordinates[0][0][0][0]).toBeCloseTo(10.33, 1)
  })

  it('refuses a coordinate system PostGIS does not know, with a clear message', async () => {
    const file = Buffer.from(JSON.stringify({
      type: 'FeatureCollection',
      crs: { type: 'name', properties: { name: 'EPSG:999999' } },
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: utmSquare } }],
    }))
    const res = await upload(northId, { buffer: file, name: 'odd.geojson' })
    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/doesn't know the file's coordinate system \(EPSG:999999\)/)
  })

  it('refuses a file without any area', async () => {
    const line = { type: 'LineString', coordinates: [[10, 50], [10.1, 50.1]] }
    const res = await upload(northId, { buffer: Buffer.from(JSON.stringify(line)), name: 'track.geojson' })
    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/no area/)
  })

  it('rejects an unsupported file type with a clear message', async () => {
    const res = await upload(northId, { buffer: Buffer.from('hello'), name: 'notes.txt' })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/Unsupported file type/)
  })

  it('rejects an empty file', async () => {
    const res = await upload(northId, { buffer: Buffer.alloc(0), name: 'empty.geojson' })
    expect(res.status).toBe(400)
  })

  it('returns NOT_FOUND when uploading to an area of another estate', async () => {
    const res = await upload(otherAreaId, { path: SAMPLE_GEOJSON })
    expect(res.status).toBe(404)
  })

  it('removes the boundary again', async () => {
    expect((await mutate('manager.areas.clearBoundary', { id: northId })).status).toBe(200)

    const area = (await query('manager.areas.get', { id: northId })).body.result.data
    expect(area.boundary).toBeNull()
  })
})

describe('access', () => {
  it('rejects requests without a session', async () => {
    const res = await request(app).get(`${TRPC}/manager.areas.list`)
    expect(res.status).toBe(401)
  })
})
