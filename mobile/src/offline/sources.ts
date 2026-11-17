import type { BBox } from '../map/bbox'
import { TILE_SIZE, tileRect, type Tile } from './tiles'

/**
 * Aerial photos that may be stored offline: the open-data orthophotos of the
 * German state surveys (DOP20, 20 cm per pixel), served over WMS. Their
 * licences allow storing and reuse with attribution. Commercial satellite
 * services such as Esri World Imagery forbid storing their tiles, so they are
 * online-only in this app.
 *
 * To add a state: one entry here (WMS address, layer, licence, rough extent).
 */
export type OfflineSource = {
  id: string
  /** Shown to the user, e.g. in the layer menu. */
  label: string
  /** Rough extent of the state; areas whose centre lies inside can use it. */
  coverage: BBox
  wms: string
  layer: string
  attribution: string
  licence: string
}

export const OFFLINE_SOURCES: OfflineSource[] = [
  {
    id: 'by-dop20',
    label: 'Aerial photo (Bavaria)',
    coverage: [8.97, 47.27, 13.84, 50.57],
    wms: 'https://geoservices.bayern.de/od/wms/dop/v1/dop20',
    layer: 'by_dop20c',
    attribution: '© Bayerische Vermessungsverwaltung – www.geodaten.bayern.de',
    licence: 'CC BY 4.0',
  },
  {
    id: 'bb-dop20',
    label: 'Aerial photo (Brandenburg)',
    coverage: [11.26, 51.35, 14.77, 53.56],
    wms: 'https://isk.geobasis-bb.de/mapproxy/dop20c/service/wms',
    layer: 'bebb_dop20c',
    attribution: '© GeoBasis-DE/LGB',
    licence: 'dl-de/by-2-0',
  },
]

export function offlineSource(id: string): OfflineSource | undefined {
  return OFFLINE_SOURCES.find((s) => s.id === id)
}

/** The source that covers an area (by the centre of its bounding box), if any. */
export function sourceForArea(box: BBox | null): OfflineSource | null {
  if (!box) return null
  const lng = (box[0] + box[2]) / 2
  const lat = (box[1] + box[3]) / 2
  return OFFLINE_SOURCES.find(({ coverage: [w, s, e, n] }) => lng >= w && lng <= e && lat >= s && lat <= n) ?? null
}

function getMapUrl(source: OfflineSource, bbox: string): string {
  return `${source.wms}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=${source.layer}&STYLES=&SRS=EPSG:3857`
    + `&BBOX=${bbox}&WIDTH=${TILE_SIZE}&HEIGHT=${TILE_SIZE}&FORMAT=image/jpeg`
}

/** The address of one tile's image. */
export function tileUrl(source: OfflineSource, tile: Tile): string {
  const r = tileRect(tile)
  return getMapUrl(source, [r.minX, r.minY, r.maxX, r.maxY].map((v) => v.toFixed(3)).join(','))
}

/** The same request as a template for the map engine, which fills in each tile's extent. */
export function tileUrlTemplate(source: OfflineSource): string {
  return getMapUrl(source, '{bbox-epsg-3857}')
}
