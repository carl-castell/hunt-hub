import { ONLINE_TOPO } from '../config'

/** The online base maps, in the order they appear in the layer menu. */
export type OnlineBasemap = {
  id: 'satellite' | 'topo' | 'osm'
  label: string
  tiles: string[]
  maxzoom: number
  attribution: string
}

export const ONLINE_BASEMAPS: OnlineBasemap[] = [
  {
    id: 'satellite',
    label: 'Satellite',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    maxzoom: 19,
    attribution: 'Tiles © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  },
  { id: 'topo', label: 'OpenTopoMap', ...ONLINE_TOPO },
  {
    id: 'osm',
    label: 'OpenStreetMap',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    maxzoom: 19,
    attribution: '© OpenStreetMap contributors',
  },
]

export const DEFAULT_BASEMAP_ID = 'satellite'

export function onlineBasemap(id: string): OnlineBasemap | undefined {
  return ONLINE_BASEMAPS.find((b) => b.id === id)
}
