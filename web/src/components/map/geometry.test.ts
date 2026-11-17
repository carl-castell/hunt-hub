import { describe, it, expect } from 'vitest'
import { insideBoundary } from './geometry'

const square: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[10, 50], [10.1, 50], [10.1, 50.1], [10, 50.1], [10, 50]]] }
const withHole: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [square.coordinates[0], [[10.04, 50.04], [10.06, 50.04], [10.06, 50.06], [10.04, 50.06], [10.04, 50.04]]],
}

describe('insideBoundary', () => {
  it('knows inside from outside', () => {
    expect(insideBoundary([10.05, 50.05], square)).toBe(true)
    expect(insideBoundary([11, 51], square)).toBe(false)
  })

  it('treats a hole as outside', () => {
    expect(insideBoundary([10.05, 50.05], withHole)).toBe(false)
    expect(insideBoundary([10.02, 50.02], withHole)).toBe(true)
  })

  it('works with multipolygons and without a boundary', () => {
    expect(insideBoundary([10.05, 50.05], { type: 'MultiPolygon', coordinates: [square.coordinates] })).toBe(true)
    expect(insideBoundary([11, 51], null)).toBe(true)
  })
})
