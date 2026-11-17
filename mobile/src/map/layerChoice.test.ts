jest.mock('../config', () => ({ ONLINE_TOPO: { tiles: ['https://t/{z}/{x}/{y}.png'], maxzoom: 17, attribution: 'topo' } }))
import { resolveBasemapId, shouldOfferOfflineMap } from './layerChoice'

const area: [number, number, number, number] = [10, 50, 10.1, 50.1]
const nordMap = { id: 'nord', bounds: [9, 49, 11, 51] as [number, number, number, number] }
const otherMap = { id: 'other', bounds: [0, 0, 1, 1] as [number, number, number, number] }

describe('resolveBasemapId', () => {
  it('keeps the choice saved for this area', () => {
    expect(resolveBasemapId('osm', true, [], area)).toBe('osm')
    expect(resolveBasemapId('nord', true, [nordMap], area)).toBe('nord')
  })

  it('ignores a saved imported map that was deleted', () => {
    expect(resolveBasemapId('gone', true, [nordMap], area)).toBe('satellite')
  })

  it('online without a saved choice: satellite', () => {
    expect(resolveBasemapId(null, true, [nordMap], area)).toBe('satellite')
  })

  it('offline without a saved choice: an imported map that covers the area', () => {
    expect(resolveBasemapId(null, false, [otherMap, nordMap], area)).toBe('nord')
  })

  it('offline without a covering imported map: satellite (cached parts only)', () => {
    expect(resolveBasemapId(null, false, [otherMap], area)).toBe('satellite')
  })

  describe('with the aerial photo and offline maps', () => {
    const stored = { available: true, stored: true }

    it('keeps "aerial" when the area has a source or a stored map', () => {
      expect(resolveBasemapId('aerial', true, [], area, { available: true, stored: false })).toBe('aerial')
      expect(resolveBasemapId('aerial', false, [], area, { available: false, stored: true })).toBe('aerial')
    })

    it('falls back to satellite when "aerial" was saved but is not available here', () => {
      expect(resolveBasemapId('aerial', true, [], area)).toBe('satellite')
    })

    it('never changes a saved choice by itself, also without connection', () => {
      expect(resolveBasemapId('satellite', false, [], area, stored)).toBe('satellite')
      expect(resolveBasemapId('nord', false, [nordMap], area, stored)).toBe('nord')
    })

    it('offline without a saved choice: the stored map before an imported one', () => {
      expect(resolveBasemapId(null, false, [nordMap], area, stored)).toBe('aerial')
    })
  })
})

describe('shouldOfferOfflineMap', () => {
  const stored = { available: true, stored: true }

  it('offers the offline map when an online map is shown and the phone has been offline for a while', () => {
    expect(shouldOfferOfflineMap('satellite', true, stored)).toBe(true)
    expect(shouldOfferOfflineMap('osm', true, stored)).toBe(true)
  })

  it('does not offer it during a short gap, without a stored map, or when the map shown works offline', () => {
    expect(shouldOfferOfflineMap('satellite', false, stored)).toBe(false)
    expect(shouldOfferOfflineMap('satellite', true, { available: true, stored: false })).toBe(false)
    expect(shouldOfferOfflineMap('aerial', true, stored)).toBe(false)
    expect(shouldOfferOfflineMap('nord', true, stored)).toBe(false)
  })
})
