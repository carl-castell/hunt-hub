jest.mock('../config', () => ({ ONLINE_TOPO: { tiles: ['https://t/{z}/{x}/{y}.png'], maxzoom: 17, attribution: 'topo' } }))
import { buildAreaStyle, mbtilesUrl } from './style'

describe('mbtilesUrl', () => {
  it('turns a file URI into an mbtiles URL with a decoded absolute path', () => {
    expect(mbtilesUrl('file:///var/mobile/Containers/Data/Application/ABC/Documents/basemaps/my%20map.mbtiles'))
      .toBe('mbtiles:///var/mobile/Containers/Data/Application/ABC/Documents/basemaps/my map.mbtiles')
  })
})

describe('buildAreaStyle', () => {
  const geo = { type: 'MultiPolygon', coordinates: [] }

  it('online: topo raster below the area outline', () => {
    const style = buildAreaStyle({ kind: 'online' }, geo)
    expect(style.layers.map((l) => l.id)).toEqual(['background', 'base', 'area-fill', 'area-line'])
    expect(style.sources.base).toMatchObject({ type: 'raster', tiles: ['https://t/{z}/{x}/{y}.png'] })
  })

  it('mbtiles: raster source from the file with its zoom range', () => {
    const style = buildAreaStyle({ kind: 'mbtiles', name: 'm', filePath: 'file:///docs/a.mbtiles', minzoom: 8, maxzoom: 16 }, geo)
    expect(style.sources.base).toEqual({ type: 'raster', url: 'mbtiles:///docs/a.mbtiles', tileSize: 256, minzoom: 8, maxzoom: 16 })
  })

  it('none: just the outline, so the map works without any tiles', () => {
    const style = buildAreaStyle({ kind: 'none' }, geo)
    expect(style.sources.base).toBeUndefined()
    expect(style.layers.map((l) => l.id)).toEqual(['background', 'area-fill', 'area-line'])
  })

  it('no geometry: no area layers', () => {
    expect(buildAreaStyle({ kind: 'none' }, null).layers.map((l) => l.id)).toEqual(['background'])
  })
})
