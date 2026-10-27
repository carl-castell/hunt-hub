import { bboxContains, bboxOf } from './bbox'

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
