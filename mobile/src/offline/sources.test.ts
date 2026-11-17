import { sourceForArea, tileUrl, tileUrlTemplate, OFFLINE_SOURCES } from './sources'

describe('offline sources', () => {
  it('finds the state survey for an area', () => {
    expect(sourceForArea([10.34, 49.73, 10.35, 49.74])?.id).toBe('by-dop20')
    expect(sourceForArea([13.89, 52.69, 13.91, 52.71])?.id).toBe('bb-dop20')
  })

  it('has none outside the covered states, or without a boundary', () => {
    expect(sourceForArea([9.9, 53.5, 10.0, 53.6])).toBeNull() // Hamburg
    expect(sourceForArea(null)).toBeNull()
  })

  it('builds a WMS request for a 512 px JPEG tile in Web Mercator', () => {
    const url = tileUrl(OFFLINE_SOURCES[0], { z: 17, x: 69302, y: 44581 })
    expect(url).toContain('https://geoservices.bayern.de/od/wms/dop/v1/dop20?SERVICE=WMS')
    expect(url).toContain('LAYERS=by_dop20c')
    expect(url).toContain('SRS=EPSG:3857')
    expect(url).toContain('WIDTH=512&HEIGHT=512&FORMAT=image/jpeg')
    expect(url).toMatch(/BBOX=-?\d+\.\d{3},-?\d+\.\d{3},-?\d+\.\d{3},-?\d+\.\d{3}/)
  })

  it('offers the same request as a template for the map', () => {
    expect(tileUrlTemplate(OFFLINE_SOURCES[1])).toContain('BBOX={bbox-epsg-3857}')
  })
})
