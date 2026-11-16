import { describe, it, expect } from 'vitest'
import { maskOutside } from './mask'

// Clockwise rings (as holes must run); counter-clockwise ones get reversed.
const ringA = [[13, 52], [13, 52.1], [13.1, 52.1], [13.1, 52], [13, 52]]
const ringB = [[14, 53], [14, 53.1], [14.1, 53.1], [14.1, 53], [14, 53]]
const counterClockwise = [[13, 52], [13.1, 52], [13.1, 52.1], [13, 52.1], [13, 52]]
const holeInA = [[13.02, 52.02], [13.03, 52.02], [13.03, 52.03], [13.02, 52.02]]

describe('maskOutside', () => {
  it('cuts each polygon of a MultiPolygon out of the world', () => {
    const mask = maskOutside({ type: 'MultiPolygon', coordinates: [[ringA], [ringB]] })

    expect(mask?.type).toBe('Polygon')
    expect(mask?.coordinates).toHaveLength(3)
    expect(mask?.coordinates[1]).toEqual(ringA)
    expect(mask?.coordinates[2]).toEqual(ringB)
  })

  it('uses only the outer ring, so holes inside the area are not shaded', () => {
    const mask = maskOutside({ type: 'Polygon', coordinates: [ringA, holeInA] })
    expect(mask?.coordinates).toEqual([expect.any(Array), ringA])
  })

  it('turns counter-clockwise rings around so they become holes', () => {
    const mask = maskOutside({ type: 'Polygon', coordinates: [counterClockwise] })
    expect(mask?.coordinates[1]).toEqual([...counterClockwise].reverse())
  })

  it('runs the world ring and the holes in opposite directions', () => {
    const mask = maskOutside({ type: 'MultiPolygon', coordinates: [[counterClockwise], [ringB]] })!
    const area = (ring: number[][]) =>
      ring.slice(0, -1).reduce((sum, p, i) => sum + p[0] * ring[i + 1][1] - ring[i + 1][0] * p[1], 0)
    expect(area(mask.coordinates[0])).toBeGreaterThan(0)
    for (const hole of mask.coordinates.slice(1)) expect(area(hole)).toBeLessThan(0)
  })

  it('returns null for geometries without polygons', () => {
    expect(maskOutside({ type: 'Point', coordinates: [13, 52] })).toBeNull()
  })
})
