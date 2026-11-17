import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { OfflineManager } from '@maplibre/maplibre-react-native'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { deleteBasemap, listBasemaps, pickAndImportBasemap, type Basemap } from '../../basemaps/basemaps'
import { BasemapError } from '../../basemaps/metadata'
import { useAuth } from '../../auth/AuthProvider'
import { useEditMode } from '../../edit/EditMode'
import { getDb } from '../../db/database'
import { setPreference, usePreferences } from '../../db/mapSettings'
import type { CoordinateFormat } from '../../map/coords'
import type { BoundaryStyle } from '../../map/style'
import { useQuery } from '../../db/useQuery'
import { formatBytes } from '../../offline/eta'
import { listOfflineMaps, type OfflineMap } from '../../offline/store'
import { useSync } from '../../sync/SyncProvider'
import { formatAgo } from '../../ui/SyncBanner'
import { useTheme } from '../../ui/theme'

/** One line under an offline map's name: its state and size. */
function offlineMapSummary(m: OfflineMap): string {
  const percent = m.tilesTotal > 0 ? Math.floor((m.tilesDone / m.tilesTotal) * 100) : 0
  switch (m.status) {
    case 'complete': return `Aerial photo · ${formatBytes(m.bytes)}`
    case 'downloading': return m.refreshBefore ? `Updating… ${percent} %` : `Downloading… ${percent} %`
    case 'paused': return `Paused at ${percent} %`
    case 'failed': return m.error ?? 'Download failed'
    default: return 'Not downloaded yet'
  }
}

export default function Settings() {
  const t = useTheme()
  const { user, logout } = useAuth()
  const sync = useSync()
  const router = useRouter()
  const basemaps = useQuery(listBasemaps, ['basemaps'])
  const offlineMaps = useQuery(listOfflineMaps, ['offline_maps'])
  const prefs = usePreferences()
  const { editStands, setEditStands } = useEditMode()
  const formats: { id: CoordinateFormat; label: string }[] = [
    { id: 'decimal', label: 'Decimal degrees' },
    { id: 'utm', label: 'UTM' },
  ]
  const boundaryStyles: { id: BoundaryStyle; label: string }[] = [
    { id: 'inverted', label: 'Inverted' },
    { id: 'line', label: 'Line only' },
  ]

  function Segments<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
    return (
      <View style={[styles.segments, { borderColor: t.border }]}>
        {options.map((o) => {
          const active = value === o.id
          return (
            <Pressable key={o.id} onPress={() => onChange(o.id)} accessibilityRole="radio" accessibilityState={{ selected: active }}
              style={[styles.segment, active && { backgroundColor: t.accent }]}>
              <Text style={{ color: active ? t.accentText : t.text, fontSize: 13 }}>{o.label}</Text>
            </Pressable>
          )
        })}
      </View>
    )
  }
  const [importing, setImporting] = useState(false)

  const importBasemap = async () => {
    setImporting(true)
    try {
      const b = await pickAndImportBasemap()
      if (b) Alert.alert('Map added', `"${b.name}" is now available on every area map, also offline.`)
    } catch (err) {
      Alert.alert('Import failed', err instanceof BasemapError ? err.message : 'The file could not be imported.')
    } finally {
      setImporting(false)
    }
  }

  const removeBasemap = (b: Basemap) => Alert.alert('Delete map?', `"${b.name}" will be removed from this phone.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => deleteBasemap(b) },
  ])

  // Tiles the map engine keeps from browsing online maps. Offline maps and imported files are not touched.
  const clearMapCache = () => Alert.alert(
    'Clear the map cache?',
    'Map tiles kept from browsing online maps are removed and loaded again when needed. Offline maps and imported files stay.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => void OfflineManager.clearAmbientCache()
          .then(() => Alert.alert('Map cache cleared'))
          .catch(() => Alert.alert('The map cache could not be cleared.')),
      },
    ],
  )

  const confirmLogout = () => {
    const warn = sync.pending > 0
      ? `${sync.pending} change${sync.pending === 1 ? '' : 's'} haven't been uploaded yet and will be lost. `
      : ''
    Alert.alert('Log out?', `${warn}Offline areas are removed from this phone. Offline maps are kept.`, [
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
    // automatic insets: on iOS 26 the top bar is see-through and the content would start behind it (see HUN-26).
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <Text style={[styles.heading, { color: t.muted }]}>MAP</Text>
      <View style={[styles.card, { backgroundColor: t.card }]}>
        <View style={[styles.row, { borderColor: t.border }]}>
          <Text style={{ color: t.text }}>Coordinates</Text>
          <Segments options={formats} value={prefs.coordinateFormat} onChange={(v) => setPreference(getDb(), 'coordinateFormat', v)} />
        </View>
        <View style={[styles.row, { borderColor: t.border }]}>
          <Text style={{ color: t.text }}>Boundary</Text>
          <Segments options={boundaryStyles} value={prefs.boundaryStyle} onChange={(v) => setPreference(getDb(), 'boundaryStyle', v)} />
        </View>
        <View style={[styles.row, { borderColor: t.border }]}>
          <Text style={{ color: t.text }}>Cross in the map centre</Text>
          <Switch value={prefs.showCrosshair} onValueChange={(v) => setPreference(getDb(), 'showCrosshair', v)} />
        </View>
        <View style={[styles.row, { borderColor: t.border }]}>
          <Text style={{ color: t.text }}>Distance rings</Text>
          <Switch value={prefs.showRings} onValueChange={(v) => setPreference(getDb(), 'showRings', v)} />
        </View>
      </View>

      <Text style={[styles.heading, { color: t.muted }]}>STANDS</Text>
      <View style={[styles.card, { backgroundColor: t.card }]}>
        <View style={[styles.row, { borderColor: t.border }]}>
          <Text style={{ color: t.text }}>Edit stands</Text>
          <Switch value={editStands} onValueChange={setEditStands} />
        </View>
        <Text style={[styles.hint, { color: t.muted, paddingBottom: 12 }]}>
          While this is on, a long press on the map creates a stand and a long press on a stand moves it. It turns off when the app restarts. Stand numbers can be changed on the stand's page at any time.
        </Text>
      </View>

      {/* Everything stored on the phone for use without internet: downloaded area maps and imported files. */}
      <Text style={[styles.heading, { color: t.muted }]}>OFFLINE MAPS</Text>
      <View style={[styles.card, { backgroundColor: t.card }]}>
        {offlineMaps.length === 0 && basemaps.length === 0 && (
          <Text style={[styles.hint, { color: t.muted }]}>
            Download the aerial photo of an area to see it without internet, or import your own .mbtiles file from the Files app.
          </Text>
        )}
        {offlineMaps.map((m) => (
          <Pressable key={m.id} onPress={() => router.push({ pathname: '/offline/[id]', params: { id: m.id } })}
            style={({ pressed }) => [styles.row, { borderColor: t.border, backgroundColor: pressed ? t.border : 'transparent' }]}>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ color: t.text }}>{m.areaName}</Text>
              <Text style={{ color: m.status === 'failed' ? t.danger : t.muted, fontSize: 12 }}>{offlineMapSummary(m)}</Text>
            </View>
            <Text style={{ color: t.muted, fontSize: 18 }}>›</Text>
          </Pressable>
        ))}
        {basemaps.map((b) => (
          <Pressable key={b.id} onLongPress={() => removeBasemap(b)} style={[styles.row, { borderColor: t.border }]}>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ color: t.text }}>{b.name}</Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>
                Imported file · {b.format.toUpperCase()}{b.minzoom != null ? ` · zoom ${b.minzoom}–${b.maxzoom ?? '?'}` : ''}
              </Text>
            </View>
            <Pressable onPress={() => removeBasemap(b)} hitSlop={10}><Text style={{ color: t.danger }}>Delete</Text></Pressable>
          </Pressable>
        ))}
        <Pressable onPress={() => router.push('/offline/new')} style={[styles.action, { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.border }]}>
          <Text style={{ color: t.accent, fontSize: 16 }}>Download offline map for an area</Text>
        </Pressable>
        <Pressable onPress={importBasemap} disabled={importing} style={[styles.action, { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.border }]}>
          <Text style={{ color: t.accent, fontSize: 16 }}>{importing ? 'Importing…' : 'Import .mbtiles file'}</Text>
        </Pressable>
        <Pressable onPress={clearMapCache} style={styles.action}>
          <Text style={{ color: t.danger, fontSize: 16 }}>Clear map cache</Text>
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
  segments: { flexDirection: 'row', borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  segment: { paddingHorizontal: 10, paddingVertical: 6 },
  hint: { paddingHorizontal: 16, paddingTop: 12, fontSize: 13, lineHeight: 18 },
})
