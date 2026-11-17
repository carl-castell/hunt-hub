import { googleMapsUrl, searchStands, standMarkerStyle, standMarkers, standsBBox } from './stands'

describe('standMarkers', () => {
  it('leaves out stands without a position', () => {
    const markers = standMarkers([
      { id: 1, number: '1', lng: 10, lat: 50 },
      { id: 2, number: '2', lng: null, lat: null },
      { id: 3, number: '3', lng: 11, lat: null },
    ])
    expect(markers).toEqual([{ id: 1, number: '1', lngLat: [10, 50], nickname: null, status: null, statusDate: null }])
  })

  it('sorts by number in natural order', () => {
    const markers = standMarkers([
      { id: 1, number: '10', lng: 1, lat: 1 },
      { id: 2, number: '2', lng: 1, lat: 1 },
      { id: 3, number: '1a', lng: 1, lat: 1 },
    ])
    expect(markers.map((m) => m.number)).toEqual(['1a', '2', '10'])
  })

  it('carries nickname and status for the stand panel', () => {
    const [marker] = standMarkers([{ id: 1, number: '1', lng: 10, lat: 50, nickname: 'Eiche', status: 'broken', status_date: '2026-11-17' }])
    expect(marker).toMatchObject({ nickname: 'Eiche', status: 'broken', statusDate: '2026-11-17' })
  })
})

describe('standsBBox', () => {
  it('is null without stands', () => {
    expect(standsBBox([])).toBeNull()
  })

  it('surrounds all stands', () => {
    expect(standsBBox([
      { lngLat: [10, 50] },
      { lngLat: [11, 49] },
    ])).toEqual([10, 49, 11, 50])
  })
})

describe('searchStands', () => {
  const stands = [{ number: '10' }, { number: '2' }, { number: '12a' }, { number: '1' }]

  it('without a search: all stands in natural order', () => {
    expect(searchStands(stands, '').map((s) => s.number)).toEqual(['1', '2', '10', '12a'])
  })

  it('finds stands whose number contains the search, ignoring case and spaces', () => {
    expect(searchStands(stands, ' 12A ').map((s) => s.number)).toEqual(['12a'])
    expect(searchStands(stands, '1').map((s) => s.number)).toEqual(['1', '10', '12a'])
  })

  it('also finds the nickname, ignoring case', () => {
    const named = [{ number: '1', nickname: 'Eiche' }, { number: '2', nickname: null }, { number: '3', nickname: 'Am Bach' }]
    expect(searchStands(named, 'eich').map((s) => s.number)).toEqual(['1'])
    expect(searchStands(named, 'BACH').map((s) => s.number)).toEqual(['3'])
  })
})

describe('googleMapsUrl', () => {
  it('builds a search link with latitude first and 6 decimals', () => {
    expect(googleMapsUrl(10.1234567, 51.7654321)).toBe('https://www.google.com/maps/search/?api=1&query=51.765432,10.123457')
  })
})

describe('standMarkerStyle', () => {
  it('zoomed in: a circle with the number', () => {
    expect(standMarkerStyle(17)).toEqual({ size: 26, fontSize: 10 })
    expect(standMarkerStyle(14.5)).toEqual({ size: 26, fontSize: 10 })
    expect(standMarkerStyle(14)).toEqual({ size: 20, fontSize: 8 })
  })

  it('zoomed out: only a dot, smaller the further out', () => {
    expect(standMarkerStyle(13)).toEqual({ size: 10, fontSize: null })
    expect(standMarkerStyle(12)).toEqual({ size: 6, fontSize: null })
  })
})
