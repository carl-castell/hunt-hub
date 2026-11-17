import * as Clipboard from 'expo-clipboard'
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { formatCoordinate, type CoordinateFormat } from '../map/coords'
import { googleMapsUrl } from '../map/stands'
import { BottomSheet } from './BottomSheet'
import { useTheme } from './theme'

export type SheetStand = { id: number; number: string; lngLat: [number, number] }

/** Tapped a stand on the map: number, coordinates, distance from you, and the next steps. */
export function StandSheet({ stand, areaName, coordinateFormat, distance, onClose, onDetails }: {
  stand: SheetStand | null
  areaName: string
  coordinateFormat: CoordinateFormat
  /** Distance from the GPS position, already formatted, e.g. "230 m from you". */
  distance: string | null
  onClose: () => void
  onDetails: (standId: number) => void
}) {
  const t = useTheme()
  const coordinates = stand ? formatCoordinate(stand.lngLat[0], stand.lngLat[1], coordinateFormat) : ''

  const copyCoordinates = async () => {
    await Clipboard.setStringAsync(coordinates)
    Alert.alert('Coordinates copied', coordinates)
  }

  const share = () => {
    if (!stand) return
    const url = googleMapsUrl(stand.lngLat[0], stand.lngLat[1])
    void Share.share({ message: `Stand ${stand.number} (${areaName}): ${url}`, url })
  }

  return (
    <BottomSheet visible={stand !== null} onClose={onClose} closeLabel="Close stand">
      {stand && (
        <View style={styles.body}>
          <Text style={[styles.title, { color: t.text }]}>Stand {stand.number}</Text>
          <Pressable onLongPress={() => void copyCoordinates()} accessibilityHint="Long press to copy">
            <Text style={[styles.coords, { color: t.text }]}>{coordinates}</Text>
          </Pressable>
          {distance && <Text style={{ color: t.muted }}>{distance}</Text>}
          <View style={styles.actions}>
            <Pressable onPress={() => onDetails(stand.id)} style={[styles.button, { backgroundColor: t.accent }]}>
              <Text style={[styles.buttonText, { color: t.accentText }]}>Details</Text>
            </Pressable>
            <Pressable onPress={share} style={[styles.button, { borderColor: t.border, borderWidth: 1 }]}>
              <Text style={[styles.buttonText, { color: t.text }]}>Share Google Maps link</Text>
            </Pressable>
          </View>
        </View>
      )}
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 12, gap: 6 },
  title: { fontSize: 20, fontWeight: '700' },
  coords: { fontSize: 15, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  button: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  buttonText: { fontSize: 15, fontWeight: '600' },
})
