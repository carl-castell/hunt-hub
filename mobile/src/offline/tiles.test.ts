import { areaHectares, marginMetres, rectTouchesRing, sampleTiles, tileRect, tilesForArea, tmsRow, toMercator } from './tiles'

// A square of about 1 km near Castell (Bavaria).
const square = { type: 'Polygon', coordinates: [[[10.34, 49.735], [10.354, 49.735], [10.354, 49.744], [10.34, 49.744], [10.34, 49.735]]] }

describe('marginMetres', () => {
  it('is 50 m at the most detailed zoom and doubles per coarser zoom, up to 2 km', () => {
    expect(marginMetres(17)).toBe(50)
    expect(marginMetres(16)).toBe(100)
    expect(marginMetres(14)).toBe(400)
    expect(marginMetres(10)).toBe(2000)
  })
})

describe('tileRect and tmsRow', () => {
  it('gives the whole world for tile 0/0/0', () => {
    const r = tileRect({ z: 0, x: 0, y: 0 })
    expect(r.minX).toBeCloseTo(-20037508.34, 1)
    expect(r.maxY).toBeCloseTo(20037508.34, 1)
  })

  it('flips the row for MBTiles', () => {
    expect(tmsRow({ z: 1, y: 0 })).toBe(1)
    expect(tmsRow({ z: 17, y: 44000 })).toBe(2 ** 17 - 1 - 44000)
  })
})

describe('rectTouchesRing', () => {
  const ring = square.coordinates[0].map((p) => toMercator(p as [number, number]))
  const [x, y] = toMercator([10.347, 49.74])

  it('finds a rectangle inside, one crossing the edge, and one around the polygon', () => {
    expect(rectTouchesRing({ minX: x - 10, minY: y - 10, maxX: x + 10, maxY: y + 10 }, ring)).toBe(true)
    const [edgeX] = toMercator([10.34, 49.74])
    expect(rectTouchesRing({ minX: edgeX - 50, minY: y - 10, maxX: edgeX + 50, maxY: y + 10 }, ring)).toBe(true)
    expect(rectTouchesRing({ minX: x - 5000, minY: y - 5000, maxX: x + 5000, maxY: y + 5000 }, ring)).toBe(true)
  })

  it('rejects a rectangle away from the polygon', () => {
    expect(rectTouchesRing({ minX: x + 5000, minY: y, maxX: x + 5100, maxY: y + 100 }, ring)).toBe(false)
  })
})

describe('tilesForArea', () => {
  const tiles = tilesForArea(square)
  const perZoom = (z: number) => tiles.filter((t) => t.z === z).length

  it('covers every zoom from 10 to 17, with most tiles at the most detailed zoom', () => {
    for (let z = 10; z <= 17; z++) expect(perZoom(z)).toBeGreaterThan(0)
    expect(perZoom(17)).toBeGreaterThan(perZoom(16))
    expect(perZoom(10)).toBeLessThanOrEqual(4)
  })

  it('needs a sensible number of tiles for 1 km²: a 512 px tile is ~200 m wide at zoom 17', () => {
    // 1 km + 2 × 50 m margin is at most 7 tiles across.
    expect(perZoom(17)).toBeGreaterThanOrEqual(25)
    expect(perZoom(17)).toBeLessThanOrEqual(56)
    expect(tiles.length).toBeLessThan(120)
  })

  it('has no duplicates', () => {
    expect(new Set(tiles.map((t) => `${t.z}/${t.x}/${t.y}`)).size).toBe(tiles.length)
  })

  it('skips tiles in the empty corner of an L-shaped area', () => {
    const l = { type: 'Polygon', coordinates: [[[10.3, 49.7], [10.36, 49.7], [10.36, 49.71], [10.31, 49.71], [10.31, 49.76], [10.3, 49.76], [10.3, 49.7]]] }
    const box = { type: 'Polygon', coordinates: [[[10.3, 49.7], [10.36, 49.7], [10.36, 49.76], [10.3, 49.76], [10.3, 49.7]]] }
    const needed = tilesForArea(l).filter((t) => t.z === 17).length
    const whole = tilesForArea(box).filter((t) => t.z === 17).length
    expect(needed).toBeLessThan(whole * 0.5)
  })

  it('handles multipolygons, features and missing boundaries', () => {
    const multi = { type: 'MultiPolygon', coordinates: [square.coordinates] }
    expect(tilesForArea(multi)).toEqual(tiles)
    expect(tilesForArea({ type: 'Feature', geometry: square })).toEqual(tiles)
    expect(tilesForArea(null)).toEqual([])
  })
})

describe('areaHectares', () => {
  it('measures about 100 ha for the 1 km square', () => {
    // 0.014° of longitude at 49.74° N ≈ 1007 m; 0.009° of latitude ≈ 1001 m.
    expect(areaHectares(square)).toBeGreaterThan(98)
    expect(areaHectares(square)).toBeLessThan(103)
  })

  it('subtracts holes', () => {
    const hole = [[10.345, 49.738], [10.349, 49.738], [10.349, 49.741], [10.345, 49.741], [10.345, 49.738]]
    expect(areaHectares({ type: 'Polygon', coordinates: [square.coordinates[0], hole] })).toBeLessThan(areaHectares(square) - 5)
  })
})

describe('sampleTiles', () => {
  it('picks tiles of the most detailed zoom, spread over the list', () => {
    const tiles = tilesForArea(square)
    const sample = sampleTiles(tiles, 8)
    expect(sample).toHaveLength(8)
    expect(sample.every((t) => t.z === 17)).toBe(true)
    expect(new Set(sample.map((t) => `${t.x}/${t.y}`)).size).toBe(8)
  })
})
