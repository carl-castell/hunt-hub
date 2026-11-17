import { Camera, Map, Marker, UserLocation, ViewAnnotation, useCurrentPosition, type CameraRef, type ViewStateChangeEvent } from '@maplibre/maplibre-react-native'
import * as Location from 'expo-location'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Linking, Pressable, StyleSheet, Text, View, type NativeSyntheticEvent } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { basemapFile, listBasemaps } from '../../../basemaps/basemaps'
import { getDb } from '../../../db/database'
import { getAreaMapSettings, saveAreaMapSettings, usePreferences, type AreaMapSettings } from '../../../db/mapSettings'
import { createStandLocal, moveStandLocal, numberExists, updateStandDetailsLocal } from '../../../db/standEdits'
import { useEditMode } from '../../../edit/EditMode'
import { promptRenameStand } from '../../../edit/renameStand'
import { insideBoundary } from '../../../map/geometry'
import { useQuery } from '../../../db/useQuery'
import { bboxOf } from '../../../map/bbox'
import { distanceBetween, formatAccuracy, formatAltitude, formatCoordinate } from '../../../map/coords'
import { resolveBasemapId } from '../../../map/layerChoice'
import { distanceRings, formatDistance, metresPerPoint } from '../../../map/scale'
import { ONLINE_BASEMAPS, onlineBasemap } from '../../../map/sources'
import { standMarkerStyle, standMarkers, standsBBox, type StandRow } from '../../../map/stands'
import { BOUNDARY_COLOR, buildAreaStyle, type BasemapChoice } from '../../../map/style'
import { isStandStatus } from '../../../stands/status'
import { useSync } from '../../../sync/SyncProvider'
import { LayerSheet } from '../../../ui/LayerSheet'
import { StandDetailsSheet, type EditableStand } from '../../../ui/StandDetailsSheet'
import { StandFormSheet } from '../../../ui/StandFormSheet'
import { StandSheet, type SheetStand } from '../../../ui/StandSheet'
import { CompassButton, Crosshair, MapButton, MapInfoBar, DistanceRings, RINGS_ON_DARK, RINGS_ON_LIGHT } from '../../../ui/MapOverlays'
import { useTheme } from '../../../ui/theme'

// Zoom to the area: the boundary almost touches the screen edges (buttons may cover it).
const PADDING = { top: 12, right: 12, bottom: 12, left: 12 }
const BUTTON = 46
const GAP = 10

type View2D = { center: [number, number]; zoom: number; bearing: number }

export default function AreaMap() {
  const t = useTheme()
  // `focus`: a stand to fly to, set by "Show on map" on the stand's page.
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>()
  const areaId = Number(id)
  const { online, syncNow } = useSync()
  const { editStands, setEditStands } = useEditMode()
  const db = getDb()
  const cameraRef = useRef<CameraRef>(null)
  const router = useRouter()
  const insets = useSafeAreaInsets()
  // Own top bar: the back button, the area name and the map buttons all start at the same height.
  const top = insets.top + 6
  const prefs = usePreferences()

  const area = useQuery(
    () => db.getFirstSync<{ id: number; name: string; geojson: string | null }>('SELECT id, name, geojson FROM areas WHERE id = ?', areaId),
    ['areas'], [areaId],
  )
  const standRows = useQuery(
    () => db.getAllSync<StandRow>('SELECT id, number, lng, lat, nickname, status, status_date FROM stands WHERE area_id = ?', areaId),
    ['stands'], [areaId],
  )
  const imported = useQuery(listBasemaps, ['basemaps'])

  const geometry = useMemo(() => (area?.geojson ? JSON.parse(area.geojson) : null), [area?.geojson])
  const stands = useMemo(() => standMarkers(standRows), [standRows])
  // Without a boundary, frame the stands instead.
  const areaBox = useMemo(() => bboxOf(geometry) ?? standsBBox(stands), [geometry, stands])

  // Layer choice, remembered per area.
  const [settings, setSettings] = useState<AreaMapSettings>(() => getAreaMapSettings(db, areaId))
  const updateSettings = useCallback((patch: Partial<AreaMapSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch }
      saveAreaMapSettings(db, areaId, next)
      return next
    })
  }, [db, areaId])
  const basemapId = resolveBasemapId(settings.basemapId, online, imported, areaBox)

  const choice: BasemapChoice = useMemo(() => {
    const m = imported.find((x) => x.id === basemapId)
    if (m) return { kind: 'mbtiles', filePath: basemapFile(m.fileName).uri, minzoom: m.minzoom, maxzoom: m.maxzoom, name: m.name }
    const o = onlineBasemap(basemapId) ?? ONLINE_BASEMAPS[0]
    return { kind: 'online', tiles: o.tiles, maxzoom: o.maxzoom, attribution: o.attribution }
  }, [basemapId, imported])

  const mapStyle = useMemo(
    () => buildAreaStyle(choice, geometry, settings.showBoundary, prefs.boundaryStyle),
    [choice, geometry, settings.showBoundary, prefs.boundaryStyle],
  )

  const [layersOpen, setLayersOpen] = useState(false)
  // The stand tapped on the map, shown in the panel at the bottom.
  const [selectedStandId, setSelectedStandId] = useState<number | null>(null)

  // Editing stands (only while "Edit stands" is on in the settings).
  // A new stand being created: where the map was pressed, and whether the GPS position is used instead.
  const [newStand, setNewStand] = useState<{ pressed: [number, number]; atGps: boolean } | null>(null)
  const [editingDetails, setEditingDetails] = useState<EditableStand | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  // Bumped after a cancelled move, so the dragged marker jumps back to its saved position.
  const [dragVersion, setDragVersion] = useState(0)

  // Location: the GPS accuracy is shown whenever there is a position; the blue dot only when turned on.
  const [locationAllowed, setLocationAllowed] = useState(false)
  const [showLocation, setShowLocation] = useState(false)
  const [following, setFollowing] = useState(false)
  useEffect(() => {
    Location.getForegroundPermissionsAsync().then((p) => setLocationAllowed(p.status === 'granted')).catch(() => {})
  }, [])
  const position = useCurrentPosition({ enabled: locationAllowed })
  const gps: [number, number] | null = position ? [position.coords.longitude, position.coords.latitude] : null

  const toggleLocation = async () => {
    if (showLocation) {
      setFollowing((f) => !f)
      return
    }
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Location is off', 'Allow location access to see where you are on the map.',
        canAskAgain ? [{ text: 'OK' }] : [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }])
      return
    }
    setLocationAllowed(true)
    setShowLocation(true)
    setFollowing(true)
  }

  const fitArea = () => {
    setFollowing(false)
    if (areaBox) cameraRef.current?.fitBounds(areaBox, { padding: PADDING, duration: 600 })
  }

  /** Asks before saving a stand outside the boundary (a warning, not an error). */
  const confirmIfOutside = (lngLat: [number, number], title: string, onConfirm: () => void, onCancel?: () => void) => {
    if (insideBoundary(lngLat, geometry)) return onConfirm()
    Alert.alert(title, 'This position is outside the area boundary. Save it anyway?', [
      { text: 'Cancel', style: 'cancel', onPress: onCancel },
      { text: 'Save anyway', onPress: onConfirm },
    ])
  }

  /** Where the new stand would go: the pressed point, or the GPS position if chosen. */
  const newStandAt: [number, number] | null = newStand ? (newStand.atGps && gps ? gps : newStand.pressed) : null

  /**
   * Shows a point in the middle of the map area that stays visible above the
   * panel and the keyboard, by moving the map centre a little south of it.
   */
  const showAboveSheet = (lngLat: [number, number]) => {
    if (!view || !size) return
    const hiddenBelow = Math.min(size.height * 0.62, 560) // panel + keyboard
    const shiftPoints = hiddenBelow / 2
    const shiftDegrees = (shiftPoints * metresPerPoint(lngLat[1], view.zoom)) / 111320
    setFollowing(false)
    cameraRef.current?.easeTo({ center: [lngLat[0], lngLat[1] - shiftDegrees], duration: 300 })
  }

  const onMapLongPress = (lngLat: [number, number]) => {
    if (!editStands) return
    setLayersOpen(false)
    setSelectedStandId(null)
    setFormError(null)
    setNewStand({ pressed: lngLat, atGps: false })
    showAboveSheet(lngLat)
  }

  const chooseGps = (atGps: boolean) => {
    if (!newStand) return
    setNewStand({ ...newStand, atGps })
    showAboveSheet(atGps && gps ? gps : newStand.pressed)
  }

  const saveNewStand = (number: string) => {
    if (!newStand || !newStandAt) return
    if (numberExists(db, areaId, number)) {
      setFormError(`Stand ${number.trim()} already exists in this area.`)
      return
    }
    confirmIfOutside(newStandAt, 'Stand outside the area', () => {
      createStandLocal(db, areaId, number, { lng: newStandAt[0], lat: newStandAt[1] })
      setNewStand(null)
      void syncNow()
    })
  }

  const onStandDragged = (stand: SheetStand, lngLat: [number, number]) => {
    const cancel = () => setDragVersion((v) => v + 1)
    const save = () => {
      moveStandLocal(db, stand.id, { lng: lngLat[0], lat: lngLat[1] })
      void syncNow()
    }
    const outside = !insideBoundary(lngLat, geometry)
    Alert.alert(`Move stand ${stand.number}?`, outside ? 'The new position is outside the area boundary.' : undefined, [
      { text: 'Cancel', style: 'cancel', onPress: cancel },
      { text: outside ? 'Save anyway' : 'Save', onPress: save },
    ])
  }

  // "Show on map" from a stand's page: fly to it, and make sure stands are visible.
  useEffect(() => {
    const target = stands.find((s) => String(s.id) === focus)
    if (!target) return
    if (!settings.showStands) updateSettings({ showStands: true })
    setFollowing(false)
    cameraRef.current?.flyTo({ center: target.lngLat, zoom: 17, duration: 800 })
    // Only when a new stand is requested, not on every change of the stands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])

  // Map centre, zoom and rotation, for the coordinates, the distance rings and the compass.
  const [view, setView] = useState<View2D | null>(null)
  const onViewChange = useCallback((e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    setView({ center: e.nativeEvent.center, zoom: e.nativeEvent.zoom, bearing: e.nativeEvent.bearing })
  }, [])
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  // Marker look by zoom step: the native markers only get new values when a step changes.
  const markerLook = standMarkerStyle(view?.zoom ?? 15)
  const rotated = view !== null && Math.abs(view.bearing) > 0.5
  const turnNorth = () => {
    if (view) cameraRef.current?.easeTo({ center: view.center, bearing: 0, duration: 300 })
  }

  if (!area) {
    return <View style={[styles.center, { backgroundColor: t.bg }]}><Text style={{ color: t.muted }}>This area no longer exists.</Text></View>
  }

  // Distance rings around the map centre; light on satellite, dark on the other maps.
  const rings = prefs.showRings && view && size
    ? distanceRings(view.center[1], view.zoom, Math.min(size.width, size.height) / 2 - 24)
    : []
  const ringColors = basemapId === 'satellite' ? RINGS_ON_DARK : RINGS_ON_LIGHT

  // Info bar. Cross on: the cross's coordinates, its distance from you and the GPS accuracy.
  // Cross off: your GPS position, its accuracy and the height above sea level.
  const join = (parts: (string | null)[]) => parts.filter(Boolean).join('  ·  ') || null
  const info = prefs.showCrosshair
    ? {
        main: view ? formatCoordinate(view.center[0], view.center[1], prefs.coordinateFormat) : null,
        sub: join([
          gps && view ? `${formatDistance(distanceBetween(gps, view.center))} from you` : null,
          position ? formatAccuracy(position.coords.accuracy) : null,
        ]),
      }
    : {
        main: gps ? formatCoordinate(gps[0], gps[1], prefs.coordinateFormat) : locationAllowed ? 'Waiting for GPS…' : 'Location access is off',
        sub: position ? join([
          formatAccuracy(position.coords.accuracy),
          position.coords.altitude != null ? formatAltitude(position.coords.altitude) : null,
        ]) : null,
      }

  const layerOptions = [
    ...ONLINE_BASEMAPS.map((b) => ({ id: b.id, label: b.label })),
    ...imported.map((b) => ({ id: b.id, label: b.name })),
  ]

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }} onLayout={(e) => setSize(e.nativeEvent.layout)}>
      {/* No standard top bar: its area would swallow taps on the map buttons. Swiping back still works. */}
      <Stack.Screen options={{ title: area.name, headerShown: false }} />
      <Map
        style={StyleSheet.absoluteFill} mapStyle={mapStyle}
        // Own compass button; the map's copyright notice is shown in the layer menu.
        logo={false} compass={false} attribution={false}
        onRegionIsChanging={onViewChange} onRegionDidChange={onViewChange}
        onLongPress={(e) => onMapLongPress(e.nativeEvent.lngLat)}
      >
        <Camera
          ref={cameraRef}
          initialViewState={areaBox ? { bounds: areaBox, padding: PADDING } : { zoom: 5, center: [10.4, 51.1] }}
          trackUserLocation={following ? 'default' : undefined}
          onTrackUserLocationChange={(e) => setFollowing(e.nativeEvent.trackUserLocation !== null)}
        />
        {showLocation && <UserLocation accuracy heading />}
        {settings.showStands && stands.map((s) => {
          // Zoomed out: a dot without number. While editing, always full size, so stands are easy to grab.
          const look = editStands ? standMarkerStyle(Infinity) : markerLook
          const label = (
            <View
              style={[styles.stand, { width: look.size, height: look.size, borderRadius: look.size / 2 },
                look.fontSize === null && styles.standDot, editStands && styles.standEditable]}
              accessibilityLabel={`Stand ${s.number}`}
            >
              {/* Up to three characters fit at full size; only longer numbers shrink to stay inside the circle. */}
              {look.fontSize !== null && (
                <Text style={[styles.standText, { fontSize: look.fontSize }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{s.number}</Text>
              )}
            </View>
          )
          const open = () => { setLayersOpen(false); setSelectedStandId(s.id) }
          // While editing, a stand can be dragged (long press, then move); otherwise it's a plain marker.
          return editStands ? (
            <ViewAnnotation key={`${s.id}-${dragVersion}`} id={`stand-${s.id}`} lngLat={s.lngLat} draggable
              onPress={open} onDragEnd={(e) => onStandDragged(s, e.nativeEvent.lngLat)}>
              {label}
            </ViewAnnotation>
          ) : (
            <Marker key={s.id} id={`stand-${s.id}`} lngLat={s.lngLat} onPress={open}>{label}</Marker>
          )
        })}
        {/* Where the new stand will go, while the form is open. */}
        {newStandAt && (
          <Marker id="new-stand" lngLat={newStandAt} anchor="bottom">
            <View style={styles.newPin} accessibilityLabel="New stand position">
              <View style={styles.newPinHead}><Text style={styles.newPinPlus}>+</Text></View>
              <View style={styles.newPinStem} />
            </View>
          </Marker>
        )}
      </Map>

      {rings.length > 0 && <DistanceRings rings={rings} colors={ringColors} />}
      {/* Cross off but rings on: a tiny cross still marks the centre of the rings. */}
      {(prefs.showCrosshair || rings.length > 0) && <Crosshair small={!prefs.showCrosshair} />}

      <View style={[styles.topLeft, { top }]} pointerEvents="box-none">
        <MapButton symbol="‹" label="Back to areas" onPress={() => router.back()} />
        {/* While stands can be edited, the title says so instead of the area name; a tap ends edit mode. */}
        <Pressable disabled={!editStands} onPress={() => setEditStands(false)}
          accessibilityRole={editStands ? 'button' : undefined} accessibilityHint={editStands ? 'Turns edit mode off' : undefined}
          style={[styles.title, { backgroundColor: editStands ? t.accent : t.card }]}>
          <Text style={[styles.titleText, { color: editStands ? t.accentText : t.text }]} numberOfLines={1}>
            {editStands ? 'Edit mode on ✕' : area.name}
          </Text>
        </Pressable>
      </View>

      {!geometry && (
        <View style={[styles.notice, { top: top + BUTTON + GAP, backgroundColor: t.card }]}>
          <Text style={{ color: t.muted }}>No boundary has been uploaded for this area yet.</Text>
        </View>
      )}

      <MapInfoBar main={info.main} sub={info.sub} bottomInset={insets.bottom} />

      <View style={[styles.buttons, { top }]} pointerEvents="box-none">
        <MapButton symbol="⧉" label={layersOpen ? 'Close layers' : 'Layers'} active={layersOpen} onPress={() => setLayersOpen((o) => !o)} />
        <MapButton symbol="⚙" label="Settings" onPress={() => router.push('/settings')} />
        <MapButton symbol="☰" label="Stand list" onPress={() => router.push({ pathname: '/stands/[areaId]', params: { areaId: String(areaId) } })} />
        <MapButton symbol="⤢" label="Show whole area" onPress={fitArea} />
        <MapButton symbol="◎" label="Show my location" active={following} onPress={toggleLocation} />
        {rotated && <CompassButton bearing={view.bearing} onPress={turnNorth} />}
      </View>

      <LayerSheet
        visible={layersOpen}
        onClose={() => setLayersOpen(false)}
        toggles={[
          { id: 'stands', label: 'Stands', on: settings.showStands, onToggle: () => updateSettings({ showStands: !settings.showStands }) },
          { id: 'boundary', label: 'Boundary', on: settings.showBoundary, onToggle: () => updateSettings({ showBoundary: !settings.showBoundary }) },
        ]}
        basemaps={layerOptions}
        selectedBasemapId={basemapId}
        onSelectBasemap={(basemapId) => updateSettings({ basemapId })}
        attribution={choice.kind === 'online' ? choice.attribution : `Imported map: ${choice.name}`}
      />

      <StandSheet
        stand={stands.find((s) => s.id === selectedStandId) ?? null}
        areaName={area.name}
        distance={(() => {
          const s = stands.find((x) => x.id === selectedStandId)
          return s && gps ? `${formatDistance(distanceBetween(gps, s.lngLat))} from you` : null
        })()}
        onClose={() => setSelectedStandId(null)}
        onRename={editStands ? (s) => promptRenameStand(db, { id: s.id, number: s.number, areaId }, () => void syncNow()) : undefined}
        onEditDetails={editStands ? (s) => {
          setSelectedStandId(null)
          setEditingDetails({ id: s.id, number: s.number, nickname: s.nickname, status: isStandStatus(s.status) ? s.status : null })
        } : undefined}
        onDetails={(standId) => {
          setSelectedStandId(null)
          router.push({ pathname: '/stand/[id]', params: { id: String(standId) } })
        }}
      />

      <StandDetailsSheet
        stand={editingDetails}
        onCancel={() => setEditingDetails(null)}
        onSave={(changes) => {
          if (editingDetails) updateStandDetailsLocal(db, editingDetails.id, changes)
          setEditingDetails(null)
          void syncNow()
        }}
      />

      <StandFormSheet
        visible={newStand !== null}
        title="Create new stand"
        location={newStand ? { atGps: newStand.atGps, hasGps: gps !== null, gpsAccuracy: position?.coords.accuracy, onChange: chooseGps } : undefined}
        error={formError}
        onSave={saveNewStand}
        onCancel={() => setNewStand(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topLeft: { position: 'absolute', left: 12, right: 12 + BUTTON + GAP, flexDirection: 'row', alignItems: 'center', gap: GAP },
  title: { flexShrink: 1, height: BUTTON, justifyContent: 'center', paddingHorizontal: 16, borderRadius: BUTTON / 2, opacity: 0.94 },
  titleText: { fontSize: 17, fontWeight: '600' },
  notice: { position: 'absolute', left: 12, right: 12 + BUTTON + GAP, padding: 12, borderRadius: 10 },
  buttons: { position: 'absolute', right: 12, gap: GAP },
  // Size per zoom step (standMarkerStyle): the same circle for every stand, three digits fit at the same font size.
  stand: { backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: BOUNDARY_COLOR, alignItems: 'center', justifyContent: 'center' },
  standDot: { backgroundColor: BOUNDARY_COLOR, borderColor: '#ffffff', borderWidth: 1 },
  newPin: { alignItems: 'center' },
  newPinHead: { width: 30, height: 30, borderRadius: 15, backgroundColor: BOUNDARY_COLOR, borderWidth: 2.5, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  newPinPlus: { color: '#ffffff', fontSize: 20, fontWeight: '700', lineHeight: 22 },
  newPinStem: { width: 2.5, height: 12, backgroundColor: BOUNDARY_COLOR },
  // Dashed border while editing: the stand can be moved.
  standEditable: { borderStyle: 'dashed', borderWidth: 2 },
  standText: { fontWeight: '700', color: BOUNDARY_COLOR, fontVariant: ['tabular-nums'], letterSpacing: -0.3 },
})
