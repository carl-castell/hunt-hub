import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useSync } from '../sync/SyncProvider'
import { useTheme } from './theme'

export function formatAgo(iso: string | null) {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(iso).toLocaleDateString()
}

/** One line telling the user whether they're online and how fresh their data is. */
export function SyncBanner() {
  const t = useTheme()
  const { online, syncing, lastSyncAt, lastError, pending } = useSync()

  let color = t.ok
  let text = `Synced ${formatAgo(lastSyncAt)}`
  if (!online) { color = t.warn; text = `Offline · data from ${formatAgo(lastSyncAt)}` }
  else if (syncing) { color = t.muted; text = 'Syncing…' }
  else if (lastError) { color = t.danger; text = `Sync failed · last success ${formatAgo(lastSyncAt)}` }
  if (pending > 0) text += ` · ${pending} change${pending === 1 ? '' : 's'} waiting`

  return (
    <View style={[styles.row, { borderColor: t.border, backgroundColor: t.card }]}>
      {syncing ? <ActivityIndicator size="small" /> : <View style={[styles.dot, { backgroundColor: color }]} />}
      <Text style={[styles.text, { color: t.muted }]} numberOfLines={1}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 13, flexShrink: 1 },
})
