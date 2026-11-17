import { useRouter } from 'expo-router'
import { useMemo } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { getDb } from '../../../db/database'
import { useQuery } from '../../../db/useQuery'
import { bboxOf, usableBoundary } from '../../../map/bbox'
import { offlineDownloads } from '../../../offline/downloader'
import { sourceForArea } from '../../../offline/sources'
import { listOfflineMaps, planOfflineMap } from '../../../offline/store'
import { useTheme } from '../../../ui/theme'

type AreaRow = { id: number; name: string; geojson: string | null }

/** Step 1 of downloading an offline map: choose the area. */
export default function ChooseArea() {
  const t = useTheme()
  const router = useRouter()
  const areas = useQuery(() => getDb().getAllSync<AreaRow>('SELECT id, name, geojson FROM areas ORDER BY name'), ['areas'])
  const maps = useQuery(listOfflineMaps, ['offline_maps'])

  const rows = useMemo(() => areas.map((area) => {
    const { geometry } = usableBoundary(area.geojson)
    const source = sourceForArea(bboxOf(geometry))
    const existing = maps.find((m) => m.areaId === area.id)
    const note = existing ? 'Already has an offline map'
      : !geometry ? 'No boundary yet'
      : !source ? 'No aerial photos available for this region yet'
      : source.label
    return { area, geometry, source, existing, note }
  }), [areas, maps])

  const choose = (row: (typeof rows)[number]) => {
    if (row.existing) return router.replace({ pathname: '/offline/[id]', params: { id: row.existing.id } })
    if (!row.geometry || !row.source) return
    const map = planOfflineMap(row.area, row.geometry, row.source)
    void offlineDownloads.estimate(map.id)
    router.replace({ pathname: '/offline/[id]', params: { id: map.id } })
  }

  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      data={rows}
      keyExtractor={(row) => String(row.area.id)}
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={
        <Text style={[styles.hint, { color: t.muted }]}>
          The aerial photo of the area and a margin around it is stored on this phone.
        </Text>
      }
      ListEmptyComponent={<Text style={[styles.hint, { color: t.muted }]}>No areas on this phone yet. Sync first.</Text>}
      renderItem={({ item }) => {
        const enabled = Boolean(item.existing || (item.geometry && item.source))
        return (
          <Pressable onPress={() => choose(item)} disabled={!enabled}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.border : t.card, borderColor: t.border, opacity: enabled ? 1 : 0.55 }]}>
            <View style={{ flexShrink: 1 }}>
              <Text style={[styles.name, { color: t.text }]}>{item.area.name}</Text>
              <Text style={{ color: t.muted, fontSize: 13 }}>{item.note}</Text>
            </View>
            {enabled && <Text style={{ color: t.muted, fontSize: 18 }}>›</Text>}
          </Pressable>
        )
      }}
    />
  )
}

const styles = StyleSheet.create({
  hint: { padding: 16, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  name: { fontSize: 17, fontWeight: '600' },
})
