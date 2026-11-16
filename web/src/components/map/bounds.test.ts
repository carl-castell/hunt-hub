import { describe, it, expect } from 'vitest'
import { boundsOf } from './bounds'

const square: GeoJSON.MultiPolygon = {
  type: 'MultiPolygon',
  coordinates: [[[[13.0, 52.0], [13.2, 52.0], [13.2, 52.1], [13.0, 52.1], [13.0, 52.0]]]],
}

describe('boundsOf', () => {
  it('returns null when there is nothing to show', () => {
    expect(boundsOf([])).toBeNull()
    expect(boundsOf([null, null])).toBeNull()
  })

  it('frames a boundary', () => {
    expect(boundsOf([square])).toEqual([[13.0, 52.0], [13.2, 52.1]])
  })

  it('includes stands outside the boundary', () => {
    const stand: GeoJSON.Point = { type: 'Point', coordinates: [13.3, 51.9] }
    expect(boundsOf([square, stand])).toEqual([[13.0, 51.9], [13.3, 52.1]])
  })

  it('frames stands alone when there is no boundary yet', () => {
    const a: GeoJSON.Point = { type: 'Point', coordinates: [13.1, 52.05] }
    const b: GeoJSON.Point = { type: 'Point', coordinates: [13.15, 52.06] }
    expect(boundsOf([null, a, b])).toEqual([[13.1, 52.05], [13.15, 52.06]])
  })
})
