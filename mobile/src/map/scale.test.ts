import { distanceRings, formatDistance, metresPerPoint, roundDistance } from './scale'

describe('metresPerPoint', () => {
  it('at the equator, zoom 0: the whole earth on 512 points', () => {
    expect(metresPerPoint(0, 0)).toBeCloseTo(40075016.686 / 512, 3)
  })

  it('halves with every zoom level and shrinks with latitude', () => {
    expect(metresPerPoint(0, 1)).toBeCloseTo(metresPerPoint(0, 0) / 2, 6)
    expect(metresPerPoint(60, 10)).toBeCloseTo(metresPerPoint(0, 10) / 2, 6)
  })
})

describe('roundDistance', () => {
  it('rounds down to 1, 2 or 5 × 10ⁿ', () => {
    expect(roundDistance(140)).toBe(100)
    expect(roundDistance(260)).toBe(200)
    expect(roundDistance(999)).toBe(500)
    expect(roundDistance(1000)).toBe(1000)
  })
})

describe('formatDistance', () => {
  it('metres below 1 km, kilometres above', () => {
    expect(formatDistance(300)).toBe('300 m')
    expect(formatDistance(1000)).toBe('1 km')
    expect(formatDistance(1500)).toBe('1.5 km')
  })
})

describe('distanceRings', () => {
  it('zoom 15 at 51°N (about 1.5 m per point), 180 points: rings every 50 m', () => {
    // 180 points ≈ 270 m; a third is 90 m, rounded down to 50 m
    const rings = distanceRings(51, 15, 180)
    expect(rings.map((r) => r.label)).toEqual(['50 m', '100 m', '150 m', '200 m', '250 m'])
    expect(rings[0].radius).toBeCloseTo(50 / 1.5032, 0)
  })

  it('no rings at all as soon as one would reach 1000 m', () => {
    for (let zoom = 8; zoom <= 20; zoom += 0.25) {
      for (const r of distanceRings(51, zoom, 180)) expect(r.metres).toBeLessThan(1000)
    }
    // Zoom 13 at 51°N: rings every 200 m, the fifth would be 1000 m, so none are shown.
    expect(distanceRings(51, 13, 180)).toEqual([])
    expect(distanceRings(51, 10, 180)).toEqual([])
  })

  it('zoomed in: at least three rings, all within the maximum radius', () => {
    for (let zoom = 14; zoom <= 20; zoom += 0.25) {
      const rings = distanceRings(51, zoom, 180)
      expect(rings.length).toBeGreaterThanOrEqual(3)
      expect(rings[rings.length - 1].radius).toBeLessThanOrEqual(180)
    }
  })
})
