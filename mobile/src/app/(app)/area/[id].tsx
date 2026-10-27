import { Camera, Map, UserLocation, type CameraRef } from '@maplibre/maplibre-react-native'
import * as Location from 'expo-location'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { basemapFile, listBasemaps, type Basemap } from '../../../basemaps/basemaps'
import { getDb } from '../../../db/database'
import { useQuery } from '../../../db/useQuery'
import { bboxContains, bboxOf, type BBox } from '../../../map/bbox'
import { buildAreaStyle, type BasemapChoice } from '../../../map/style'
import { useSync } from '../../../sync/SyncProvider'
import { useTheme } from '../../../ui/theme'

const PADDING = { top: 48, right: 32, bottom: 48, left: 32 }

/** Offline, prefer an imported map that covers the area; online, the topo map. */
function defaultChoice(online: boolean, basemaps: Basemap[], areaBox: BBox | null): string {
  const covering = basemaps.find((b) => !areaBox || !b.bounds || bboxContains(b.bounds, areaBox))
  if (!online && covering) return covering.id
  if (online) return 'online'
  return basemaps[0]?.id ?? 'none'
}

export default function AreaMap() {
  const t = useTheme()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { online } = useSync()
  const db = getDb()
  const cameraRef = useRef<CameraRef>(null)

  const area = useQuery(
    () => db.getFirstSync<{ id: number; name: string; geojson: string | null }>('SELECT id, name, geojson FROM areas WHERE id = ?', Number(id)),
    ['areas'], [id],
  )
  const basemaps = useQuery(listBasemaps, ['basemaps'])

  const geometry = useMemo(() => (area?.geojson ? JSON.parse(area.geojson) : null), [area?.geojson])
  const areaBox = useMemo(() => bboxOf(geometry), [geometry])

  const [choiceId, setChoiceId] = useState<string | null>(null)
  useEffect(() => {
    if (choiceId === null) setChoiceId(defaultChoice(online, basemaps, areaBox))
  }, [choiceId, online, basemaps, areaBox])

  const [showLocation, setShowLocation] = useState(false)
  const [following, setFollowing] = useState(false)

  const choice: BasemapChoice = useMemo(() => {
    const b = basemaps.find((x) => x.id === choiceId)
    if (b) return { kind: 'mbtiles', filePath: basemapFile(b.fileName).uri, minzoom: b.minzoom, maxzoom: b.maxzoom, name: b.name }
    return choiceId === 'none' ? { kind: 'none' } : { kind: 'online' }
  }, [choiceId, basemaps])

  const mapStyle = useMemo(() => buildAreaStyle(choice, geometry), [choice, geometry])

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
    setShowLocation(true)
    setFollowing(true)
  }

  const fitArea = () => {
    setFollowing(false)
    if (areaBox) cameraRef.current?.fitBounds(areaBox, { padding: PADDING, duration: 600 })
  }

  if (!area) {
    return <View style={[styles.center, { backgroundColor: t.bg }]}><Text style={{ color: t.muted }}>This area no longer exists.</Text></View>
  }

  const options = [
    { id: 'online', label: online ? 'Topo (online)' : 'Topo (cached)' },
    ...basemaps.map((b) => ({ id: b.id, label: b.name })),
    { id: 'none', label: 'Outline only' },
  ]

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: area.name }} />
      <Map style={{ flex: 1 }} mapStyle={mapStyle} logo={false} compass scaleBar attributionPosition={{ bottom: 8, left: 8 }}>
        <Camera
          ref={cameraRef}
          initialViewState={areaBox ? { bounds: areaBox, padding: PADDING } : { zoom: 5, center: [10.4, 51.1] }}
          trackUserLocation={following ? 'default' : undefined}
          onTrackUserLocationChange={(e) => setFollowing(e.nativeEvent.trackUserLocation !== null)}
        />
        {showLocation && <UserLocation accuracy heading />}
      </Map>

      {!geometry && (
        <View style={[styles.notice, { backgroundColor: t.card }]}>
          <Text style={{ color: t.muted }}>No boundary has been uploaded for this area yet.</Text>
        </View>
      )}

      <View style={styles.fabs} pointerEvents="box-none">
        <Pressable style={[styles.fab, { backgroundColor: t.card }]} onPress={fitArea} accessibilityLabel="Show whole area">
          <Text style={[styles.fabText, { color: t.text }]}>⤢</Text>
        </Pressable>
        <Pressable
          style={[styles.fab, { backgroundColor: following ? t.accent : t.card }]}
          onPress={toggleLocation} accessibilityLabel="Show my location"
        >
          <Text style={[styles.fabText, { color: following ? t.accentText : t.text }]}>◎</Text>
        </Pressable>
      </View>

      <SafeAreaView edges={['bottom']} style={{ backgroundColor: t.card }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {options.map((o) => {
            const active = o.id === choiceId
            return (
              <Pressable key={o.id} onPress={() => setChoiceId(o.id)}
                style={[styles.chip, { borderColor: active ? t.accent : t.border, backgroundColor: active ? t.accent : 'transparent' }]}>
                <Text style={{ color: active ? t.accentText : t.text }} numberOfLines={1}>{o.label}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notice: { position: 'absolute', top: 12, left: 12, right: 12, padding: 12, borderRadius: 10 },
  fabs: { position: 'absolute', right: 12, bottom: 90, gap: 10 },
  fab: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  fabText: { fontSize: 22 },
  chips: { gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, maxWidth: 220 },
})
