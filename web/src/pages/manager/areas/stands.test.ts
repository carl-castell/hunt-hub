import { describe, it, expect } from 'vitest'
import { searchStands, standPosition } from './stands'

const stands = [
  { id: 1, number: '10', location: null },
  { id: 2, number: '2', location: null },
  { id: 3, number: '12a', location: null },
  { id: 4, number: '1', location: null },
]

describe('searchStands', () => {
  it('without a search: all stands in natural order', () => {
    expect(searchStands(stands, '').map((s) => s.number)).toEqual(['1', '2', '10', '12a'])
  })

  it('finds stands whose number contains the search', () => {
    expect(searchStands(stands, '1').map((s) => s.number)).toEqual(['1', '10', '12a'])
    expect(searchStands(stands, ' 12A ').map((s) => s.number)).toEqual(['12a'])
  })
})

describe('standPosition', () => {
  it('returns the coordinates of a point, null otherwise', () => {
    expect(standPosition({ id: 1, number: '1', location: { type: 'Point', coordinates: [13, 52] } })).toEqual([13, 52])
    expect(standPosition({ id: 1, number: '1', location: null })).toBeNull()
  })
})
