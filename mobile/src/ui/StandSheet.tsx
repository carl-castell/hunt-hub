import { Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { googleMapsUrl } from '../map/stands'
import { BottomSheet } from './BottomSheet'
import { useTheme } from './theme'

export type SheetStand = { id: number; number: string; lngLat: [number, number] }

/**
 * Tapped a stand on the map: number, distance from you, and the next steps.
 * In edit mode (`onRename` given) a tap on the title changes the number.
 */
export function StandSheet({ stand, areaName, distance, onClose, onDetails, onRename }: {
  stand: SheetStand | null
  areaName: string
  /** Distance from the GPS position, already formatted, e.g. "230 m from you". */
  distance: string | null
  onClose: () => void
  onDetails: (standId: number) => void
  onRename?: (stand: SheetStand) => void
}) {
  const t = useTheme()

  const share = () => {
    if (!stand) return
    const url = googleMapsUrl(stand.lngLat[0], stand.lngLat[1])
    void Share.share({ message: `Stand ${stand.number} (${areaName}): ${url}`, url })
  }

  return (
    <BottomSheet visible={stand !== null} onClose={onClose} closeLabel="Close stand">
      {stand && (
        <View style={styles.body}>
          <Pressable disabled={!onRename} onPress={() => onRename?.(stand)}
            accessibilityRole={onRename ? 'button' : 'header'} accessibilityHint={onRename ? 'Tap to change the number' : undefined}>
            <Text style={[styles.title, { color: onRename ? t.accent : t.text }]}>Stand {stand.number}{onRename ? '  ✎' : ''}</Text>
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
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  button: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  buttonText: { fontSize: 15, fontWeight: '600' },
})
