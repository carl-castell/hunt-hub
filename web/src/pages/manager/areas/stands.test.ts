import { describe, it, expect } from 'vitest'
import { formatStatusDate, searchStands, standPosition, standTitle, todayIso } from './stands'

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
    expect(standPosition({ location: { type: 'Point', coordinates: [13, 52] } })).toEqual([13, 52])
    expect(standPosition({ location: null })).toBeNull()
  })
})

describe('search by nickname', () => {
  const named = [
    { number: '1', nickname: 'Eiche' },
    { number: '2', nickname: null },
    { number: '3', nickname: 'Am Bach' },
  ]

  it('finds stands whose nickname contains the search, ignoring case', () => {
    expect(searchStands(named, 'eich').map((s) => s.number)).toEqual(['1'])
    expect(searchStands(named, 'BACH').map((s) => s.number)).toEqual(['3'])
  })
})

describe('standTitle', () => {
  it('adds the nickname when there is one', () => {
    expect(standTitle({ number: '12', nickname: 'Eiche' })).toBe('Stand 12 · Eiche')
    expect(standTitle({ number: '12', nickname: null })).toBe('Stand 12')
  })
})

describe('dates', () => {
  it('formats a status date for the reader', () => {
    expect(formatStatusDate('2026-11-17', 'en-GB')).toBe('17 Nov 2026')
    expect(formatStatusDate('2026-11-17', 'de-DE')).toBe('17. Nov. 2026')
  })

  it("gives today's local date as YYYY-MM-DD", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})
