import { bboxContains, bboxOf, usableBoundary } from './bbox'

describe('bboxOf', () => {
  it('handles a MultiPolygon', () => {
    expect(bboxOf({
      type: 'MultiPolygon',
      coordinates: [[[[10, 50], [11, 50], [11, 51], [10, 50]]], [[[9.5, 49.8], [9.6, 49.8], [9.6, 49.9], [9.5, 49.8]]]],
    })).toEqual([9.5, 49.8, 11, 51])
  })

  it('handles features, collections and points', () => {
    expect(bboxOf({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] } },
        { type: 'Feature', geometry: { type: 'GeometryCollection', geometries: [{ type: 'LineString', coordinates: [[3, 4], [-1, 0]] }] } },
      ],
    })).toEqual([-1, 0, 3, 4])
  })

  it('returns null without coordinates', () => {
    expect(bboxOf(null)).toBeNull()
    expect(bboxOf({ type: 'MultiPolygon', coordinates: [] })).toBeNull()
  })
})

describe('bboxContains', () => {
  it('checks containment', () => {
    expect(bboxContains([0, 0, 10, 10], [1, 1, 9, 9])).toBe(true)
    expect(bboxContains([0, 0, 10, 10], [1, 1, 11, 9])).toBe(false)
  })
})

describe('usableBoundary', () => {
  const square = { type: 'Polygon', coordinates: [[[10, 50], [10.1, 50], [10.1, 50.1], [10, 50]]] }
  const utm = { type: 'Polygon', coordinates: [[[596900, 5510300], [597600, 5510300], [597600, 5511100], [596900, 5510300]]] }

  it('keeps a boundary in longitude/latitude', () => {
    expect(usableBoundary(JSON.stringify(square))).toEqual({ geometry: square, broken: false })
  })

  it('leaves out a boundary in other units (e.g. UTM metres) or unreadable text', () => {
    expect(usableBoundary(JSON.stringify(utm))).toEqual({ geometry: null, broken: true })
    expect(usableBoundary('{not json')).toEqual({ geometry: null, broken: true })
  })

  it('is empty without a boundary', () => {
    expect(usableBoundary(null)).toEqual({ geometry: null, broken: false })
  })
})
