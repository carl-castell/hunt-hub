import { Link, Stack } from 'expo-router'
import { useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { getDb } from '../../db/database'
import { useQuery } from '../../db/useQuery'
import { useSync } from '../../sync/SyncProvider'
import { SyncBanner } from '../../ui/SyncBanner'
import { useTheme } from '../../ui/theme'

type AreaRow = { id: number; name: string; has_geo: number; stand_count: number }

export default function AreaList() {
  const t = useTheme()
  const db = getDb()
  const { syncNow, online, lastSyncAt } = useSync()
  const [refreshing, setRefreshing] = useState(false)

  const areas = useQuery(() => db.getAllSync<AreaRow>(`
    SELECT a.id, a.name, a.geojson IS NOT NULL AS has_geo,
           (SELECT COUNT(*) FROM stands s WHERE s.area_id = a.id) AS stand_count
    FROM areas a ORDER BY a.name COLLATE NOCASE`), ['areas', 'stands'])

  const refresh = async () => {
    setRefreshing(true)
    await syncNow()
    setRefreshing(false)
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{
        headerRight: () => (
          <Link href="/settings" asChild>
            <Pressable hitSlop={12}><Text style={{ color: t.accent, fontSize: 16 }}>Settings</Text></Pressable>
          </Link>
        ),
      }} />
      <SyncBanner />
      <FlatList
        data={areas}
        keyExtractor={(a) => String(a.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        contentContainerStyle={areas.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: t.muted }]}>
            {lastSyncAt ? 'No areas in your estate yet.' : online ? 'Loading areas…' : 'Connect to the internet once to download your areas.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Link href={{ pathname: '/area/[id]', params: { id: String(item.id) } }} asChild>
            <Pressable style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.border : t.card, borderColor: t.border }]}>
              <Text style={[styles.name, { color: t.text }]}>{item.name}</Text>
              <Text style={[styles.meta, { color: t.muted }]}>
                {item.has_geo ? `${item.stand_count} stand${item.stand_count === 1 ? '' : 's'}` : 'No boundary uploaded'}
              </Text>
            </Pressable>
          </Link>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  name: { fontSize: 17, fontWeight: '500' },
  meta: { fontSize: 13, marginTop: 2 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { textAlign: 'center', paddingHorizontal: 32, fontSize: 15 },
})
