import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { maplibregl } from './maplibre'
import { boundsOf } from './bounds'
import { areaStyle, type BasemapId, type BoundaryStyle } from './areaStyle'
import { applyStandMarkerStyle, standMarkerStyle } from './standMarker'

/** `title` is the tooltip, e.g. "Stand 12 · Eiche (Broken)". */
export type MapStand = { id: number; number: string; title: string; location: GeoJSON.Point | null }

/** What the page can do with the map: its own zoom buttons, "whole area" and "fly to stand". */
export type AreaMapHandle = {
  zoomIn: () => void
  zoomOut: () => void
  fitArea: () => void
  flyTo: (position: [number, number]) => void
}

type AreaMapProps = {
  boundary: GeoJSON.Geometry | null
  stands: MapStand[]
  basemapId: BasemapId
  showBoundary: boolean
  boundaryStyle: BoundaryStyle
  showStands: boolean
  ref?: Ref<AreaMapHandle>
}

/** Roughly central Germany, shown when the area has neither boundary nor stands. */
const FALLBACK_VIEW = { center: [10.4, 51.1] as [number, number], zoom: 5 }
const EMPTY_STYLE: maplibregl.StyleSpecification = { version: 8, sources: {}, layers: [] }
const FIT_OPTIONS = { padding: 40, maxZoom: 17 }

/**
 * Map of one area: a base map, the boundary (everything outside shaded red)
 * and the stands as numbered markers. The map is created once per area;
 * changing the base map or turning layers on and off only updates it, so the
 * view stays where it is.
 */
export function AreaMap({ boundary, stands, basemapId, showBoundary, boundaryStyle, showStands, ref }: AreaMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const boundsRef = useRef<ReturnType<typeof boundsOf>>(null)

  // Create the map and its markers; zoom to the area.
  useEffect(() => {
    if (!container.current) return

    const placedStands = stands.filter((s): s is MapStand & { location: GeoJSON.Point } => s.location !== null)
    const bounds = boundsOf([boundary, ...placedStands.map((s) => s.location)])
    boundsRef.current = bounds

    const map = new maplibregl.Map({
      container: container.current,
      style: EMPTY_STYLE, // the real style is set by the effect below
      ...(bounds ? { bounds, fitBoundsOptions: FIT_OPTIONS } : FALLBACK_VIEW),
      attributionControl: false,
    })
    // Bottom left, below the legend.
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')

    // HTML markers instead of a symbol layer: no font server needed for the numbers.
    // Same look as the iPhone app: one circle size for all numbers, dots when zoomed out.
    let look = standMarkerStyle(map.getZoom())
    const markers = placedStands.map((stand) => {
      const element = document.createElement('div')
      element.title = stand.title
      applyStandMarkerStyle(element, stand.number, look)
      return new maplibregl.Marker({ element }).setLngLat(stand.location.coordinates as [number, number]).addTo(map)
    })
    // Restyle only when the zoom crosses a step.
    map.on('zoom', () => {
      const next = standMarkerStyle(map.getZoom())
      if (next.size === look.size) return
      look = next
      markers.forEach((marker, i) => applyStandMarkerStyle(marker.getElement(), placedStands[i].number, look))
    })

    mapRef.current = map
    markersRef.current = markers
    return () => {
      markers.forEach((marker) => marker.remove())
      map.remove()
      mapRef.current = null
      markersRef.current = []
    }
  }, [boundary, stands])

  // Base map and boundary: update the style without recreating the map.
  useEffect(() => {
    mapRef.current?.setStyle(areaStyle(basemapId, boundary, showBoundary, boundaryStyle))
  }, [basemapId, boundary, showBoundary, boundaryStyle, stands])

  // Stands on or off.
  useEffect(() => {
    for (const marker of markersRef.current) marker.getElement().style.display = showStands ? 'flex' : 'none'
  }, [showStands, stands])

  useImperativeHandle(ref, () => ({
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
    fitArea: () => {
      if (boundsRef.current) mapRef.current?.fitBounds(boundsRef.current, FIT_OPTIONS)
    },
    flyTo: (position) => {
      const map = mapRef.current
      if (map) map.flyTo({ center: position, zoom: Math.max(map.getZoom(), 17) })
    },
  }), [])

  return <div ref={container} className="h-full w-full" />
}
