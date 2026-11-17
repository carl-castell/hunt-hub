jest.mock('../config', () => ({ ONLINE_TOPO: { tiles: ['https://t/{z}/{x}/{y}.png'], maxzoom: 17, attribution: 'topo' } }))
import { resolveBasemapId } from './layerChoice'

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
})
