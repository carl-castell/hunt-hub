import * as Clipboard from 'expo-clipboard'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { getDb } from '../../../db/database'
import { usePreferences } from '../../../db/mapSettings'
import { useQuery } from '../../../db/useQuery'
import { promptRenameStand } from '../../../edit/renameStand'
import { useSync } from '../../../sync/SyncProvider'
import { formatCoordinate } from '../../../map/coords'
import { googleMapsUrl } from '../../../map/stands'
import { useTheme } from '../../../ui/theme'

type StandDetail = { id: number; number: string; lng: number | null; lat: number | null; updated_at: string; area_id: number; area_name: string }

/** Everything the app knows about one stand. Long press the coordinates to copy them. */
export default function StandDetails() {
  const t = useTheme()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const db = getDb()
  const prefs = usePreferences()
  const { syncNow } = useSync()

  const stand = useQuery(() => db.getFirstSync<StandDetail>(
    `SELECT s.id, s.number, s.lng, s.lat, s.updated_at, s.area_id, a.name AS area_name
     FROM stands s JOIN areas a ON a.id = s.area_id WHERE s.id = ?`, Number(id),
  ), ['stands', 'areas'], [id])

  if (!stand) {
    return <View style={[styles.center, { backgroundColor: t.bg }]}><Text style={{ color: t.muted }}>This stand no longer exists.</Text></View>
  }

  const hasPosition = stand.lng != null && stand.lat != null
  const copy = async (label: string, value: string) => {
    await Clipboard.setStringAsync(value)
    Alert.alert(`${label} copied`, value)
  }

  const shareGoogleMaps = () => {
    if (!hasPosition) return
    const url = googleMapsUrl(stand.lng!, stand.lat!)
    void Share.share({ message: `Stand ${stand.number} (${stand.area_name}): ${url}`, url })
  }

  // The pencil next to the number renames the stand (also outside edit mode).
  const rename = () => promptRenameStand(db, { id: stand.id, number: stand.number, areaId: stand.area_id }, () => void syncNow())

  const showOnMap = () => {
    // Back to the area's map (instead of opening a second one), which then flies to the stand.
    router.dismissTo({ pathname: '/area/[id]', params: { id: String(stand.area_id), focus: String(stand.id) } })
  }

  // Coordinates in the format chosen in the settings; only they can be copied.
  const rows: { label: string; value: string; copyable?: boolean; onEdit?: () => void }[] = [
    { label: 'Number', value: stand.number, onEdit: rename },
    { label: 'Area', value: stand.area_name },
    hasPosition
      ? { label: 'Coordinates', value: formatCoordinate(stand.lng!, stand.lat!, prefs.coordinateFormat), copyable: true }
      : { label: 'Position', value: 'Not placed yet' },
    { label: 'Last changed', value: new Date(stand.updated_at).toLocaleString() },
  ]

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <Stack.Screen options={{ title: `Stand ${stand.number}` }} />
      <View style={[styles.card, { backgroundColor: t.card }]}>
        {rows.map((r) => (
          <Pressable key={r.label} disabled={!r.copyable}
            onLongPress={r.copyable ? () => void copy(r.label, r.value) : undefined}
            accessibilityHint={r.copyable ? 'Long press to copy' : undefined}
            style={({ pressed }) => [styles.row, { borderColor: t.border, backgroundColor: pressed && r.copyable ? t.border : 'transparent' }]}>
            <Text style={{ color: t.muted }}>{r.label}</Text>
            <View style={styles.valueWrap}>
              <Text style={[styles.value, { color: t.text }]}>{r.value}</Text>
              {r.onEdit && (
                <Pressable onPress={r.onEdit} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Change ${r.label.toLowerCase()}`}
                  style={[styles.editButton, { backgroundColor: t.bg }]}>
                  <Text style={{ color: t.accent, fontSize: 16 }}>✎</Text>
                </Pressable>
              )}
            </View>
          </Pressable>
        ))}
      </View>
      {hasPosition && <Text style={[styles.hint, { color: t.muted }]}>Long press the coordinates to copy them.</Text>}

      {hasPosition && (
        <View style={[styles.card, { backgroundColor: t.card }]}>
          <Pressable onPress={showOnMap} style={[styles.action, { borderColor: t.border }]}>
            <Text style={{ color: t.accent, fontSize: 16 }}>Show on map</Text>
          </Pressable>
          <Pressable onPress={shareGoogleMaps} onLongPress={() => void copy('Google Maps link', googleMapsUrl(stand.lng!, stand.lat!))}
            style={styles.action} accessibilityHint="Long press to copy the link">
            <Text style={{ color: t.accent, fontSize: 16 }}>Share Google Maps link</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 8, paddingBottom: 48 },
  card: { borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  valueWrap: { flexDirection: 'row', alignItems: 'center', gap: 18, flexShrink: 1 },
  editButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  value: { flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  hint: { fontSize: 12, marginLeft: 4, marginBottom: 12 },
  action: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
})
