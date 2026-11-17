import { useKeepAwake } from 'expo-keep-awake'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '../../../db/useQuery'
import { offlineDownloads, TYPICAL_TILES_PER_SECOND, useSecondsLeft } from '../../../offline/downloader'
import { formatBytes, formatDuration } from '../../../offline/eta'
import { offlineSource } from '../../../offline/sources'
import { deleteOfflineMap, getOfflineMap, type OfflineMap } from '../../../offline/store'
import { useSync } from '../../../sync/SyncProvider'
import { useTheme } from '../../../ui/theme'

/** Keeps the screen on while this page shows a running download. */
function KeepAwake() {
  useKeepAwake()
  return null
}

/**
 * One offline map: its size and estimate before the download, progress and
 * time left during it, and deleting it afterwards. The download belongs to
 * the app, not to this page: leaving the page doesn't stop it.
 */
export default function OfflineMapPage() {
  const t = useTheme()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { online } = useSync()
  const map = useQuery(() => getOfflineMap(id), ['offline_maps'], [id])
  const secondsLeft = useSecondsLeft(id)

  if (!map) {
    return <View style={[styles.center, { backgroundColor: t.bg }]}><Text style={{ color: t.muted }}>This offline map no longer exists.</Text></View>
  }

  const source = offlineSource(map.sourceId)
  const fraction = map.tilesTotal > 0 ? map.tilesDone / map.tilesTotal : 0
  const hectares = new Intl.NumberFormat(undefined, { maximumFractionDigits: map.areaHa < 10 ? 1 : 0 }).format(map.areaHa)
  const expected = map.estimatedBytes ?? 0

  const remove = (title: string, message: string, action: string) => Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: () => { deleteOfflineMap(map.id); router.back() } },
  ])
  const cancelPlan = () => { deleteOfflineMap(map.id); router.back() }
  const stop = () => remove('Stop the download?', 'The tiles downloaded so far are removed.', 'Stop and remove')
  const deleteMap = () => remove('Delete offline map?', `The offline map of "${map.areaName}" will be removed from this phone.`, 'Delete')

  // Updating can take long, so it asks first and says what to expect.
  const update = () => Alert.alert(
    'Download this map again?',
    `Newer aerial photos replace the stored ones: about ${formatBytes(map.bytes)}, roughly ${formatDuration(map.tilesTotal / TYPICAL_TILES_PER_SECOND).replace('about ', '')}. The map stays usable meanwhile.`,
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Update', onPress: () => offlineDownloads.update(map.id) }],
  )
  const updating = map.refreshBefore !== null
  // The state surveys fly new photos about every two years.
  const old = map.completedAt !== null && Date.now() - new Date(map.completedAt).getTime() > 2 * 365 * 24 * 3600 * 1000

  const Row = ({ label, value }: { label: string; value: string }) => (
    <View style={[styles.row, { borderColor: t.border }]}>
      <Text style={{ color: t.muted }}>{label}</Text>
      <Text style={[styles.value, { color: t.text }]}>{value}</Text>
    </View>
  )
  const Button = ({ label, onPress, kind = 'plain', disabled = false }: { label: string; onPress: () => void; kind?: 'primary' | 'plain' | 'danger'; disabled?: boolean }) => (
    <Pressable onPress={onPress} disabled={disabled}
      style={[styles.button, kind === 'primary' ? { backgroundColor: t.accent } : { borderWidth: 1, borderColor: t.border }, disabled && { opacity: 0.5 }]}>
      <Text style={[styles.buttonText, { color: kind === 'primary' ? t.accentText : kind === 'danger' ? t.danger : t.text }]}>{label}</Text>
    </Pressable>
  )

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <Stack.Screen options={{ title: map.areaName }} />
      {map.status === 'downloading' && <KeepAwake />}

      <View style={[styles.card, { backgroundColor: t.card }]}>
        <Row label="Area" value={map.areaName} />
        <Row label="Size of the area" value={`${hectares} ha`} />
        <Row label="Map" value={source?.label ?? 'Aerial photo'} />
        <Row label="Detail" value="about 0.4 m per pixel" />
        {map.status === 'complete'
          ? <Row label="Storage used" value={formatBytes(map.bytes)} />
          : <Row label="Estimated storage" value={map.estimatedBytes != null ? `about ${formatBytes(expected)}` : 'Estimating…'} />}
        {map.completedAt && <Row label="Downloaded on" value={new Date(map.completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} />}
      </View>

      {map.status === 'estimating' && (
        <View style={styles.status}>
          <ActivityIndicator />
          <Text style={{ color: t.muted }}>Estimating the size from a few sample tiles…</Text>
        </View>
      )}

      {(map.status === 'downloading' || map.status === 'paused') && (
        <View style={[styles.card, styles.progressCard, { backgroundColor: t.card }]}>
          <View style={[styles.track, { backgroundColor: t.border }]} accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}>
            <View style={[styles.fill, { backgroundColor: t.accent, width: `${Math.round(fraction * 100)}%` }]} />
          </View>
          <Text style={[styles.percent, { color: t.text }]}>
            {updating
              ? `Updating: ${Math.floor(fraction * 100)} %`
              : `${Math.floor(fraction * 100)} % · ${formatBytes(map.bytes)}${expected > 0 ? ` of about ${formatBytes(expected)}` : ''}`}
          </Text>
          <Text style={{ color: t.muted }}>
            {map.status === 'paused' ? 'Paused.'
              : !online ? 'Waiting for an internet connection…'
              : secondsLeft != null ? `Time left: ${formatDuration(secondsLeft)}`
              : 'Working out the time left…'}
          </Text>
          <Text style={[styles.note, { color: t.muted }]}>
            You can leave this page; the download continues while the app is open. If you leave the app, it pauses and carries on when you come back.
          </Text>
        </View>
      )}

      {map.status === 'failed' && <Text style={[styles.note, { color: t.danger, paddingHorizontal: 4 }]}>{map.error ?? 'The download failed.'}</Text>}
      {map.status === 'complete' && (
        <Text style={[styles.note, { color: t.muted, paddingHorizontal: 4 }]}>
          {old
            ? 'This map is stored on the phone and works without internet. It is more than two years old; newer aerial photos may be available: tap Update.'
            : 'This map is stored on the phone and works without internet.'}
        </Text>
      )}

      <View style={styles.buttons}>
        {map.status === 'estimated' && <>
          <Button label="Cancel" onPress={cancelPlan} />
          <Button label="Download" kind="primary" onPress={() => offlineDownloads.start(map.id)} />
        </>}
        {map.status === 'estimating' && <Button label="Cancel" onPress={cancelPlan} />}
        {map.status === 'downloading' && <>
          {!updating && <Button label="Stop" kind="danger" onPress={stop} />}
          <Button label="Pause" onPress={() => offlineDownloads.pause(map.id)} />
        </>}
        {map.status === 'paused' && <>
          {!updating && <Button label="Stop" kind="danger" onPress={stop} />}
          <Button label="Resume" kind="primary" onPress={() => offlineDownloads.start(map.id)} />
        </>}
        {map.status === 'failed' && <>
          <Button label="Remove" kind="danger" onPress={cancelPlan} />
          <Button label="Try again" kind="primary" onPress={() => retry(map)} />
        </>}
        {map.status === 'complete' && <>
          <Button label="Delete" kind="danger" onPress={deleteMap} />
          <Button label="Update" onPress={update} />
        </>}
      </View>

      {source && <Text style={[styles.note, { color: t.muted, paddingHorizontal: 4 }]}>{source.attribution} · Licence: {source.licence}</Text>}
    </ScrollView>
  )
}

/** After a failure: estimate again if that is what failed, otherwise carry on downloading. */
function retry(map: OfflineMap) {
  if (map.estimatedBytes == null) void offlineDownloads.estimate(map.id)
  else offlineDownloads.start(map.id)
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  card: { borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  value: { flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  progressCard: { padding: 16, gap: 8 },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  percent: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  note: { fontSize: 13, lineHeight: 18 },
  buttons: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  buttonText: { fontSize: 16, fontWeight: '600' },
})
