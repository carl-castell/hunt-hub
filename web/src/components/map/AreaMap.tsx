import { useEffect, useRef } from 'react'
import { maplibregl } from './maplibre'
import { boundsOf } from './bounds'
import { maskOutside } from './mask'

export type MapStand = { id: number; number: string; location: GeoJSON.Point | null }

type AreaMapProps = {
  boundary: GeoJSON.Geometry | null
  stands: MapStand[]
}

const BOUNDARY_COLOR = '#dc2626'
/** Roughly central Germany, shown when the area has neither boundary nor stands. */
const FALLBACK_VIEW = { center: [10.4, 51.1] as [number, number], zoom: 5 }

/**
 * Satellite imagery only (same source as the old pages). The boundary is part
 * of the style itself, so it is drawn as soon as the map renders, without
 * waiting for any load event. Everything outside the area is shaded red.
 */
function satelliteStyle(boundary: GeoJSON.Geometry | null): maplibregl.StyleSpecification {
  const mask = boundary ? maskOutside(boundary) : null
  const style: maplibregl.StyleSpecification = {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© <a href="https://www.esri.com">Esri</a>',
      },
    },
    layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
  }

  if (boundary && mask) {
    style.sources.outside = { type: 'geojson', data: mask }
    style.sources.boundary = { type: 'geojson', data: boundary }
    style.layers.push(
      { id: 'outside-shade', type: 'fill', source: 'outside', paint: { 'fill-color': BOUNDARY_COLOR, 'fill-opacity': 0.25 } },
      { id: 'boundary-line', type: 'line', source: 'boundary', paint: { 'line-color': BOUNDARY_COLOR, 'line-width': 2.5 } },
    )
  }
  return style
}

/** Read-only satellite map of one area: its boundary and its stands as numbered markers. */
export function AreaMap({ boundary, stands }: AreaMapProps) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!container.current) return

    const placedStands = stands.filter((s): s is MapStand & { location: GeoJSON.Point } => s.location !== null)
    const bounds = boundsOf([boundary, ...placedStands.map((s) => s.location)])

    const map = new maplibregl.Map({
      container: container.current,
      style: satelliteStyle(boundary),
      ...(bounds ? { bounds, fitBoundsOptions: { padding: 40, maxZoom: 17 } } : FALLBACK_VIEW),
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    // HTML markers instead of a symbol layer: no font server needed for the numbers.
    const markers = placedStands.map((stand) => {
      const element = document.createElement('div')
      element.className =
        'flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-primary px-1 text-[11px] font-semibold text-primary-foreground shadow'
      element.textContent = stand.number
      element.title = `Stand ${stand.number}`
      return new maplibregl.Marker({ element }).setLngLat(stand.location.coordinates as [number, number]).addTo(map)
    })

    return () => {
      markers.forEach((marker) => marker.remove())
      map.remove()
    }
  }, [boundary, stands])

  return <div ref={container} className="h-80 w-full overflow-hidden rounded-md border border-border" />
}
