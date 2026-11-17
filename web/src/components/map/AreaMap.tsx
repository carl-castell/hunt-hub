import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react'
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
  /** Flies to a position; with `standId`, that stand stays highlighted until the user clicks or moves the map. */
  flyTo: (position: [number, number], standId?: number) => void
}

type AreaMapProps = {
  boundary: GeoJSON.Geometry | null
  stands: MapStand[]
  basemapId: BasemapId
  showBoundary: boolean
  boundaryStyle: BoundaryStyle
  showStands: boolean
  /** Edit mode: stands can be dragged and are always drawn full size. */
  editable?: boolean
  /** Waiting for a click that places a new stand (crosshair cursor). */
  placing?: boolean
  /** A click while `placing`, or a right-click while `editable`: where a new stand should go. */
  onPlace?: (lngLat: [number, number]) => void
  /** A stand was dragged to a new position. `revert` puts the marker back (e.g. on Cancel). */
  onMoveStand?: (standId: number, lngLat: [number, number], revert: () => void) => void
  ref?: Ref<AreaMapHandle>
}

/** Roughly central Germany, shown when the area has neither boundary nor stands. */
const FALLBACK_VIEW = { center: [10.4, 51.1] as [number, number], zoom: 5 }
const EMPTY_STYLE: maplibregl.StyleSpecification = { version: 8, sources: {}, layers: [] }
const FIT_OPTIONS = { padding: 40, maxZoom: 17 }
/** In edit mode every stand is drawn as a full circle, so it can be grabbed (same as the iPhone app). */
const EDIT_ZOOM = 20

/**
 * Map of one area: a base map, the boundary (everything outside shaded red)
 * and the stands as numbered markers. The map is created once per area;
 * changing the base map, the layers or the stands only updates it, so the
 * view stays where it is (also after adding or moving a stand).
 */
export function AreaMap({
  boundary, stands, basemapId, showBoundary, boundaryStyle, showStands,
  editable = false, placing = false, onPlace, onMoveStand, ref,
}: AreaMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const markerByStand = useRef(new Map<number, maplibregl.Marker>())
  const highlighted = useRef<number | null>(null)
  const boundsRef = useRef<ReturnType<typeof boundsOf>>(null)
  // Latest values for the map's event handlers, which are registered once.
  const latest = useRef({ stands, editable, placing, onPlace, onMoveStand })
  // Runs before the effects below, so they always see the current values.
  useLayoutEffect(() => {
    latest.current = { stands, editable, placing, onPlace, onMoveStand }
  })

  function setHighlight(standId: number | null) {
    if (highlighted.current !== null) markerByStand.current.get(highlighted.current)?.getElement().classList.remove('stand-highlight')
    highlighted.current = standId
    if (standId !== null) markerByStand.current.get(standId)?.getElement().classList.add('stand-highlight')
  }

  // Create the map once per area and zoom to it (boundary plus the stands known at that moment).
  useEffect(() => {
    if (!container.current) return
    const points = latest.current.stands.flatMap((s) => (s.location ? [s.location] : []))
    const bounds = boundsOf([boundary, ...points])
    boundsRef.current = bounds

    const map = new maplibregl.Map({
      container: container.current,
      style: EMPTY_STYLE, // the real style is set by the effect below
      ...(bounds ? { bounds, fitBoundsOptions: FIT_OPTIONS } : FALLBACK_VIEW),
      attributionControl: false,
    })
    // Bottom left, below the legend.
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')

    map.on('click', (e) => {
      if (latest.current.placing) latest.current.onPlace?.([e.lngLat.lng, e.lngLat.lat])
    })
    map.on('contextmenu', (e) => {
      if (latest.current.editable) latest.current.onPlace?.([e.lngLat.lng, e.lngLat.lat])
    })
    // The highlight of a stand chosen in the list ends with the user's next click or map move
    // (not with the flight to the stand itself, which has no originalEvent).
    map.on('click', () => setHighlight(null))
    map.on('movestart', (e) => { if (e.originalEvent) setHighlight(null) })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [boundary])

  // Stand markers: rebuilt when the stands or edit mode change, without touching the view.
  // HTML markers instead of a symbol layer: no font server needed for the numbers.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const placed = stands.filter((s): s is MapStand & { location: GeoJSON.Point } => s.location !== null)
    const lookFor = () => standMarkerStyle(editable ? EDIT_ZOOM : map.getZoom())
    let look = lookFor()

    const markers = placed.map((stand) => {
      const element = document.createElement('div')
      element.title = editable ? `${stand.title} – drag to move` : stand.title
      if (!showStands) element.style.display = 'none'
      applyStandMarkerStyle(element, stand.number, look)
      if (editable) element.style.cursor = 'grab'
      const start = stand.location.coordinates as [number, number]
      const marker = new maplibregl.Marker({ element, draggable: editable }).setLngLat(start).addTo(map)
      marker.on('dragend', () => {
        const { lng, lat } = marker.getLngLat()
        latest.current.onMoveStand?.(stand.id, [lng, lat], () => marker.setLngLat(start))
      })
      return marker
    })
    markerByStand.current = new Map(placed.map((stand, i) => [stand.id, markers[i]]))
    if (highlighted.current !== null) markerByStand.current.get(highlighted.current)?.getElement().classList.add('stand-highlight')

    // Restyle only when the zoom crosses a step.
    const onZoom = () => {
      const next = lookFor()
      if (next.size === look.size) return
      look = next
      markers.forEach((marker, i) => applyStandMarkerStyle(marker.getElement(), placed[i].number, look))
    }
    map.on('zoom', onZoom)
    markersRef.current = markers
    return () => {
      map.off('zoom', onZoom)
      markers.forEach((marker) => marker.remove())
      markersRef.current = []
      markerByStand.current = new Map()
    }
    // showStands is applied by its own effect; here it only sets the initial state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stands, editable, boundary])

  // Base map and boundary: update the style without recreating the map.
  useEffect(() => {
    mapRef.current?.setStyle(areaStyle(basemapId, boundary, showBoundary, boundaryStyle))
  }, [basemapId, boundary, showBoundary, boundaryStyle])

  // Stands on or off.
  useEffect(() => {
    for (const marker of markersRef.current) marker.getElement().style.display = showStands ? 'flex' : 'none'
  }, [showStands, stands])

  // A crosshair while waiting for the click that places a new stand.
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = placing ? 'crosshair' : ''
  }, [placing])

  useImperativeHandle(ref, () => ({
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
    fitArea: () => {
      if (boundsRef.current) mapRef.current?.fitBounds(boundsRef.current, FIT_OPTIONS)
    },
    flyTo: (position, standId) => {
      const map = mapRef.current
      if (!map) return
      setHighlight(standId ?? null)
      map.flyTo({ center: position, zoom: Math.max(map.getZoom(), 17) })
    },
  }), [])

  return <div ref={container} className="h-full w-full" />
}
