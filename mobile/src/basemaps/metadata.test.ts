import { BasemapError, parseMbtilesMetadata, sniffTileFormat } from './metadata'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
const WEBP = new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0))))
const GZIP = new Uint8Array([0x1f, 0x8b, 0x08])

describe('sniffTileFormat', () => {
  it.each([[PNG, 'png'], [JPG, 'jpg'], [WEBP, 'webp'], [GZIP, 'pbf'], [new Uint8Array([1, 2, 3]), null]])('%#', (bytes, expected) => {
    expect(sniffTileFormat(bytes)).toBe(expected)
  })
})

describe('parseMbtilesMetadata', () => {
  const meta = (o: Record<string, string>) => Object.entries(o).map(([name, value]) => ({ name, value }))

  it('reads a raster tileset', () => {
    expect(parseMbtilesMetadata(meta({ name: 'Revier Nord', format: 'jpeg', minzoom: '10', maxzoom: '17', bounds: '10.1, 50.2, 10.5, 50.6' }), 'file', PNG))
      .toEqual({ name: 'Revier Nord', format: 'jpg', minzoom: 10, maxzoom: 17, bounds: [10.1, 50.2, 10.5, 50.6] })
  })

  it('falls back to the file name and the first tile when metadata is thin', () => {
    expect(parseMbtilesMetadata([], 'my-map', WEBP)).toEqual({ name: 'my-map', format: 'webp', minzoom: null, maxzoom: null, bounds: null })
  })

  it('ignores invalid bounds and zooms', () => {
    const info = parseMbtilesMetadata(meta({ format: 'png', bounds: '1,2,3', minzoom: 'x', maxzoom: '99' }), 'f', null)
    expect(info).toMatchObject({ bounds: null, minzoom: null, maxzoom: null })
  })

  it.each([
    [meta({ format: 'pbf' }), PNG, /vector/],
    [[], GZIP, /vector/],
    [[], null, /no tiles/],
    [meta({ format: 'tiff' }), new Uint8Array([0, 0]), /Unknown tile format/],
  ])('rejects unsupported files %#', (rows, tile, message) => {
    expect(() => parseMbtilesMetadata(rows, 'f', tile)).toThrow(BasemapError)
    expect(() => parseMbtilesMetadata(rows, 'f', tile)).toThrow(message)
  })
})
