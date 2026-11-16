import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useState } from 'react'
import { deleteBasemap, listBasemaps, pickAndImportBasemap, type Basemap } from '../../basemaps/basemaps'
import { BasemapError } from '../../basemaps/metadata'
import { useAuth } from '../../auth/AuthProvider'
import { getDb } from '../../db/database'
import { useQuery } from '../../db/useQuery'
import { useSync } from '../../sync/SyncProvider'
import { formatAgo } from '../../ui/SyncBanner'
import { useTheme } from '../../ui/theme'

export default function Settings() {
  const t = useTheme()
  const { user, logout } = useAuth()
  const sync = useSync()
  const basemaps = useQuery(listBasemaps, ['basemaps'])
  const [importing, setImporting] = useState(false)

  const importBasemap = async () => {
    setImporting(true)
    try {
      const b = await pickAndImportBasemap()
      if (b) Alert.alert('Basemap added', `"${b.name}" is now available on every area map, also offline.`)
    } catch (err) {
      Alert.alert('Import failed', err instanceof BasemapError ? err.message : 'The file could not be imported.')
    } finally {
      setImporting(false)
    }
  }

  const removeBasemap = (b: Basemap) => Alert.alert('Delete basemap?', `"${b.name}" will be removed from this phone.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => deleteBasemap(b) },
  ])

  const confirmLogout = () => {
    const warn = sync.pending > 0
      ? `${sync.pending} change${sync.pending === 1 ? '' : 's'} haven't been uploaded yet and will be lost. `
      : ''
    Alert.alert('Log out?', `${warn}Offline areas are removed from this phone. Imported basemaps are kept.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void logout() },
    ])
  }

  const Row = ({ label, value }: { label: string; value: string }) => (
    <View style={[styles.row, { borderColor: t.border }]}>
      <Text style={{ color: t.text }}>{label}</Text>
      <Text style={{ color: t.muted, flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  )

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.content}>
      <Text style={[styles.heading, { color: t.muted }]}>BASEMAPS</Text>
      <View style={[styles.card, { backgroundColor: t.card }]}>
        {basemaps.length === 0 && (
          <Text style={[styles.hint, { color: t.muted }]}>
            Import a raster .mbtiles file to have a detailed map without internet. Save the file to the Files app (e.g. via AirDrop) first.
          </Text>
        )}
        {basemaps.map((b) => (
          <Pressable key={b.id} onLongPress={() => removeBasemap(b)} style={[styles.row, { borderColor: t.border }]}>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ color: t.text }}>{b.name}</Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>
                {b.format.toUpperCase()}{b.minzoom != null ? ` · zoom ${b.minzoom}–${b.maxzoom ?? '?'}` : ''}
              </Text>
            </View>
            <Pressable onPress={() => removeBasemap(b)} hitSlop={10}><Text style={{ color: t.danger }}>Delete</Text></Pressable>
          </Pressable>
        ))}
        <Pressable onPress={importBasemap} disabled={importing} style={styles.action}>
          <Text style={{ color: t.accent, fontSize: 16 }}>{importing ? 'Importing…' : 'Import .mbtiles file'}</Text>
        </Pressable>
      </View>

      <Text style={[styles.heading, { color: t.muted }]}>SYNC</Text>
      <View style={[styles.card, { backgroundColor: t.card }]}>
        <Row label="Connection" value={sync.online ? 'Online' : 'Offline'} />
        <Row label="Last sync" value={formatAgo(sync.lastSyncAt)} />
        <Row label="Waiting to upload" value={String(sync.pending)} />
        {sync.rejected > 0 && <Row label="Refused by server" value={String(sync.rejected)} />}
        {sync.lastError && <Row label="Last error" value={sync.lastError} />}
        <Pressable onPress={() => void sync.syncNow()} disabled={!sync.online || sync.syncing} style={styles.action}>
          <Text style={{ color: sync.online ? t.accent : t.muted, fontSize: 16 }}>{sync.syncing ? 'Syncing…' : 'Sync now'}</Text>
        </Pressable>
      </View>

      <Text style={[styles.heading, { color: t.muted }]}>ACCOUNT</Text>
      <View style={[styles.card, { backgroundColor: t.card }]}>
        <Row label="Name" value={user ? `${user.firstName} ${user.lastName}` : ''} />
        <Row label="Email" value={user?.email ?? ''} />
        <Row label="Role" value={user?.role ?? ''} />
        <Pressable onPress={confirmLogout} style={styles.action}>
          <Text style={{ color: t.danger, fontSize: 16 }}>Log out</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, paddingBottom: 48 },
  heading: { fontSize: 12, fontWeight: '600', marginTop: 12, marginLeft: 4 },
  card: { borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  action: { paddingHorizontal: 16, paddingVertical: 14 },
  hint: { paddingHorizontal: 16, paddingTop: 12, fontSize: 13, lineHeight: 18 },
})
