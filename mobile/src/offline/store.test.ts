/**
 * The storage rules of offline maps, run against a real SQLite (Node's
 * built-in one) in place of the phone's: shared tiles are stored once,
 * progress counts tiles another map already brought, and deleting a map
 * keeps the tiles another map still needs.
 */
import { DatabaseSync } from 'node:sqlite'

/** The small part of expo-sqlite's API the store uses, on top of node:sqlite. */
function fakeDatabase() {
  const db = new DatabaseSync(':memory:')
  return {
    execSync: (sql: string) => db.exec(sql),
    runSync: (sql: string, ...params: any[]) => db.prepare(sql).run(...params),
    getAllSync: (sql: string, ...params: any[]) => db.prepare(sql).all(...params),
    getFirstSync: (sql: string, ...params: any[]) => db.prepare(sql).get(...params) ?? null,
    withTransactionSync: (work: () => void) => { db.exec('BEGIN'); work(); db.exec('COMMIT') },
  }
}

const mockAppDb = fakeDatabase()
const mockTileDb = fakeDatabase()
let mockIds = 0

jest.mock('expo-sqlite', () => ({ openDatabaseSync: () => mockTileDb }))
jest.mock('expo-crypto', () => ({ randomUUID: () => `map-${++mockIds}` }))
jest.mock('expo-file-system', () => ({
  Paths: { document: {} },
  Directory: class { exists = true; uri = 'file:///docs/basemaps'; create() {} },
  File: class { exists = false; size = 0 },
}))
jest.mock('../db/database', () => ({ getDb: () => mockAppDb }))

import { MIGRATIONS } from '../db/migrations'
import { OFFLINE_SOURCES } from './sources'
import {
  deleteOfflineMap, getOfflineMap, getTileDb, listOfflineMaps, missingTiles, planOfflineMap, refreshProgress, saveTile, setStatus,
} from './store'

const source = OFFLINE_SOURCES[0]
const square = (west: number) => ({
  type: 'Polygon',
  coordinates: [[[west, 49.735], [west + 0.014, 49.735], [west + 0.014, 49.744], [west, 49.744], [west, 49.735]]],
})
const tileCount = () => (getTileDb().getFirstSync('SELECT COUNT(*) AS n FROM tiles') as { n: number }).n
const download = (mapId: string) => {
  for (let tiles = missingTiles(mapId, 50); tiles.length > 0; tiles = missingTiles(mapId, 50)) {
    for (const tile of tiles) saveTile(tile, new Uint8Array(1000))
  }
  return refreshProgress(mapId)
}

beforeAll(() => {
  mockAppDb.execSync(MIGRATIONS[MIGRATIONS.length - 1])
})

describe('offline map storage', () => {
  let first: string
  let second: string

  it('plans a map: its tiles are listed, nothing is downloaded yet', () => {
    const map = planOfflineMap({ id: 1, name: 'North' }, square(10.34), source)
    first = map.id
    expect(map).toMatchObject({ areaId: 1, areaName: 'North', sourceId: 'by-dop20', status: 'estimating', tilesDone: 0 })
    expect(map.tilesTotal).toBeGreaterThan(30)
    expect(map.areaHa).toBeGreaterThan(95)
    expect(missingTiles(first, 1000)).toHaveLength(map.tilesTotal)
  })

  it('returns the existing map when the area already has one', () => {
    expect(planOfflineMap({ id: 1, name: 'North' }, square(10.34), source).id).toBe(first)
    expect(listOfflineMaps()).toHaveLength(1)
  })

  it('counts progress and bytes as tiles arrive', () => {
    const total = getOfflineMap(first)!.tilesTotal
    const { done, bytes } = download(first)
    expect(done).toBe(total)
    expect(bytes).toBe(total * 1000)
    setStatus(first, 'complete')
    expect(getOfflineMap(first)).toMatchObject({ status: 'complete', tilesDone: total, bytes: total * 1000 })
    expect(getOfflineMap(first)!.completedAt).not.toBeNull()
  })

  it('shares tiles with an overlapping map: only the new ones are missing', () => {
    // Half a square further east: overlaps the first map.
    const map = planOfflineMap({ id: 2, name: 'East' }, square(10.347), source)
    second = map.id
    const missing = missingTiles(second, 1000).length
    expect(missing).toBeGreaterThan(0)
    expect(missing).toBeLessThan(map.tilesTotal)
    // The shared tiles already count as done.
    expect(getOfflineMap(second)!.tilesDone).toBe(map.tilesTotal - missing)

    const before = tileCount()
    download(second)
    expect(tileCount()).toBe(before + missing)
  })

  it('deleting a map keeps the tiles the other map needs', () => {
    const secondTotal = getOfflineMap(second)!.tilesTotal
    deleteOfflineMap(first)
    expect(getOfflineMap(first)).toBeNull()
    expect(tileCount()).toBe(secondTotal)
    expect(missingTiles(second, 1000)).toHaveLength(0)
  })

  it('deleting the last map empties the tile store', () => {
    deleteOfflineMap(second)
    expect(tileCount()).toBe(0)
    expect(listOfflineMaps()).toEqual([])
  })
})
