import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { getDb } from '../../../db/database'
import { usePreferences } from '../../../db/mapSettings'
import { useQuery } from '../../../db/useQuery'
import { formatCoordinate } from '../../../map/coords'
import { searchStands, type StandRow } from '../../../map/stands'
import { isStandStatus, STAND_STATUS_COLORS, statusText } from '../../../stands/status'
import { useTheme } from '../../../ui/theme'

/** All stands of one area, searchable by number or nickname. A tap opens the stand. */
export default function StandList() {
  const t = useTheme()
  const router = useRouter()
  const { areaId } = useLocalSearchParams<{ areaId: string }>()
  const db = getDb()
  const prefs = usePreferences()
  const [query, setQuery] = useState('')

  const area = useQuery(() => db.getFirstSync<{ name: string }>('SELECT name FROM areas WHERE id = ?', Number(areaId)), ['areas'], [areaId])
  const stands = useQuery(
    () => db.getAllSync<StandRow>('SELECT id, number, lng, lat, nickname, status, status_date FROM stands WHERE area_id = ?', Number(areaId)),
    ['stands'], [areaId],
  )
  const found = useMemo(() => searchStands(stands, query), [stands, query])

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: area ? `Stands – ${area.name}` : 'Stands' }} />
      {/* The list is the first scrolling element, so iOS keeps it below the top bar (see HUN-26). */}
      <FlatList
        data={found}
        keyExtractor={(s) => String(s.id)}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={[styles.searchWrap, { backgroundColor: t.bg }]}>
            <TextInput
              value={query} onChangeText={setQuery} placeholder="Search number or name" placeholderTextColor={t.muted}
              autoCorrect={false} autoCapitalize="none" clearButtonMode="while-editing" accessibilityLabel="Search stands"
              style={[styles.search, { backgroundColor: t.card, color: t.text, borderColor: t.border }]}
            />
          </View>
        }
        stickyHeaderIndices={[0]}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: t.muted }]}>
            {stands.length === 0 ? 'This area has no stands yet.' : 'No stand matches this search.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/stand/[id]', params: { id: String(item.id) } })}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.border : t.card, borderColor: t.border }]}
          >
            <Text style={[styles.number, { color: t.text }]}>{item.number}</Text>
            <View style={styles.middle}>
              {item.nickname ? <Text style={[styles.nickname, { color: t.text }]} numberOfLines={1}>{item.nickname}</Text> : null}
              {isStandStatus(item.status) && (
                <View style={styles.statusLine}>
                  <View style={[styles.dot, { backgroundColor: STAND_STATUS_COLORS[item.status] }]} />
                  <Text style={[styles.meta, { color: t.muted }]} numberOfLines={1}>{statusText(item.status, item.status_date)}</Text>
                </View>
              )}
              <Text style={[styles.meta, { color: t.muted }]} numberOfLines={1}>
                {item.lng != null && item.lat != null ? formatCoordinate(item.lng, item.lat, prefs.coordinateFormat) : 'No position'}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  searchWrap: { padding: 12 },
  search: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  number: { fontSize: 17, fontWeight: '600', minWidth: 48 },
  meta: { fontSize: 13, flexShrink: 1, fontVariant: ['tabular-nums'] },
  middle: { flex: 1, gap: 2 },
  nickname: { fontSize: 16 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  empty: { textAlign: 'center', padding: 32, fontSize: 15 },
})
