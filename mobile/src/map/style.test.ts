import { buildAreaStyle, mbtilesUrl } from './style'

describe('mbtilesUrl', () => {
  it('turns a file URI into an mbtiles URL with a decoded absolute path', () => {
    expect(mbtilesUrl('file:///var/mobile/Containers/Data/Application/ABC/Documents/basemaps/my%20map.mbtiles'))
      .toBe('mbtiles:///var/mobile/Containers/Data/Application/ABC/Documents/basemaps/my map.mbtiles')
  })
})

describe('buildAreaStyle', () => {
  const ring = [[13, 52], [13, 52.1], [13.1, 52.1], [13.1, 52], [13, 52]]
  const geo = { type: 'Polygon', coordinates: [ring] }
  const online = { kind: 'online' as const, tiles: ['https://t/{z}/{x}/{y}.png'], maxzoom: 17, attribution: 'topo' }

  it('online: raster base map, red shade outside the area, boundary line on top', () => {
    const style = buildAreaStyle(online, geo)
    expect(style.layers.map((l) => l.id)).toEqual(['background', 'base', 'outside-shade', 'area-line'])
    expect((style.sources.outside as any).data.coordinates[1]).toEqual(ring)
    expect(style.sources.base).toMatchObject({ type: 'raster', tiles: ['https://t/{z}/{x}/{y}.png'], maxzoom: 17 })
  })

  it('mbtiles: raster source from the file with its zoom range', () => {
    const style = buildAreaStyle({ kind: 'mbtiles', name: 'm', filePath: 'file:///docs/a.mbtiles', minzoom: 8, maxzoom: 16 }, geo)
    expect(style.sources.base).toEqual({ type: 'raster', url: 'mbtiles:///docs/a.mbtiles', tileSize: 256, minzoom: 8, maxzoom: 16 })
  })

  it('line style: only the boundary line, no shade', () => {
    const style = buildAreaStyle(online, geo, true, 'line')
    expect(style.layers.map((l) => l.id)).toEqual(['background', 'base', 'area-line'])
    expect(style.sources.outside).toBeUndefined()
  })

  it('boundary turned off: no area layers', () => {
    const style = buildAreaStyle(online, geo, false)
    expect(style.layers.map((l) => l.id)).toEqual(['background', 'base'])
    expect(style.sources.area).toBeUndefined()
    expect(style.sources.outside).toBeUndefined()
  })

  it('no geometry: no area layers', () => {
    expect(buildAreaStyle(online, null).layers.map((l) => l.id)).toEqual(['background', 'base'])
  })
})
