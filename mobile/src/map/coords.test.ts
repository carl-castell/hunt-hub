import { formatAccuracy, formatCoordinate, toUtm } from './coords'

describe('toUtm', () => {
  it('central meridian on the equator: easting 500000, northing 0', () => {
    expect(toUtm(0, 3)).toMatchObject({ zone: 31, band: 'N', easting: 500000, northing: 0 })
  })

  it('45°N on the central meridian of zone 32: northing is the scaled meridian arc', () => {
    const u = toUtm(45, 9)!
    expect(u).toMatchObject({ zone: 32, band: 'T' })
    expect(u.easting).toBeCloseTo(500000, 3)
    expect(u.northing).toBeCloseTo(4982950.4, 0)
  })

  it('equator at 0° (3° west of the central meridian of zone 31)', () => {
    const u = toUtm(0, 0)!
    expect(u.zone).toBe(31)
    expect(u.easting).toBeCloseTo(166021.4, 0)
    expect(u.northing).toBeCloseTo(0, 3)
  })

  it('southern hemisphere uses the false northing of 10 000 000 m', () => {
    const u = toUtm(-10, 9)!
    expect(u.band).toBe('L')
    expect(u.northing).toBeGreaterThan(8800000)
    expect(u.northing).toBeLessThan(10000000)
  })

  it('Norway exception: western Norway is zone 32', () => {
    expect(toUtm(60, 5)!.zone).toBe(32)
  })

  it('is null outside the UTM range', () => {
    expect(toUtm(85, 10)).toBeNull()
  })
})

describe('formatCoordinate', () => {
  it('decimal degrees: latitude first, 5 decimals', () => {
    expect(formatCoordinate(10.123456, 51.123456, 'decimal')).toBe('51.12346, 10.12346')
  })

  it('UTM: zone, band, easting and northing in whole metres', () => {
    expect(formatCoordinate(9, 45, 'utm')).toBe('32T 500000 4982950')
  })

  it('UTM outside its range falls back to decimal degrees', () => {
    expect(formatCoordinate(10, 85, 'utm')).toBe('85.00000, 10.00000')
  })
})

describe('formatAccuracy', () => {
  it('rounds to whole metres, never below 1', () => {
    expect(formatAccuracy(4.6)).toBe('GPS ± 5 m')
    expect(formatAccuracy(0.2)).toBe('GPS ± 1 m')
  })
})
