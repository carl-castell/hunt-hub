import { describe, it, expect } from 'vitest'
import { areaStyle, BASEMAPS, DEFAULT_BASEMAP } from './areaStyle'

const boundary: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[13, 52], [13, 52.1], [13.1, 52.1], [13.1, 52], [13, 52]]] }

describe('areaStyle', () => {
  it('satellite is the default and the first base map', () => {
    expect(DEFAULT_BASEMAP).toBe('satellite')
    expect(BASEMAPS.map((b) => b.id)).toEqual(['satellite', 'topo', 'osm'])
  })

  it('uses the tiles of the chosen base map', () => {
    const style = areaStyle('osm', null, true)
    expect(style.sources.base).toMatchObject({ type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'] })
  })

  it('shades everything outside the boundary and draws the line on top', () => {
    const style = areaStyle('satellite', boundary, true)
    expect(style.layers.map((l) => l.id)).toEqual(['base', 'outside-shade', 'boundary-line'])
  })

  it('line style: only the boundary line, no shade', () => {
    const style = areaStyle('satellite', boundary, true, 'line')
    expect(style.layers.map((l) => l.id)).toEqual(['base', 'boundary-line'])
    expect(style.sources.outside).toBeUndefined()
  })

  it('boundary turned off: only the base map', () => {
    const style = areaStyle('topo', boundary, false)
    expect(style.layers.map((l) => l.id)).toEqual(['base'])
    expect(style.sources.boundary).toBeUndefined()
  })

  it('no boundary: only the base map', () => {
    expect(areaStyle('satellite', null, true).layers.map((l) => l.id)).toEqual(['base'])
  })
})
