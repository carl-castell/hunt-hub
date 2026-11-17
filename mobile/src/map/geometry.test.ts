import { insideBoundary } from './geometry'

const square = [[10, 50], [10.1, 50], [10.1, 50.1], [10, 50.1], [10, 50]]
const hole = [[10.04, 50.04], [10.06, 50.04], [10.06, 50.06], [10.04, 50.06], [10.04, 50.04]]
const other = [[11, 51], [11.1, 51], [11.1, 51.1], [11, 51.1], [11, 51]]

describe('insideBoundary', () => {
  it('Polygon: inside and outside', () => {
    const g = { type: 'Polygon', coordinates: [square] }
    expect(insideBoundary([10.02, 50.02], g)).toBe(true)
    expect(insideBoundary([10.2, 50.02], g)).toBe(false)
  })

  it('a point in a hole is outside', () => {
    expect(insideBoundary([10.05, 50.05], { type: 'Polygon', coordinates: [square, hole] })).toBe(false)
  })

  it('MultiPolygon: inside any of its shapes', () => {
    const g = { type: 'MultiPolygon', coordinates: [[square], [other]] }
    expect(insideBoundary([11.05, 51.05], g)).toBe(true)
    expect(insideBoundary([10.5, 50.5], g)).toBe(false)
  })

  it('no boundary: nothing to warn about', () => {
    expect(insideBoundary([10, 50], null)).toBe(true)
  })
})
