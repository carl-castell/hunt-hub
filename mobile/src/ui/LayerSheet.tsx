import { Pressable, StyleSheet, Text, View } from 'react-native'
import { BottomSheet } from './BottomSheet'
import { useTheme } from './theme'

export type LayerToggle = { id: string; label: string; on: boolean; onToggle: () => void }
export type LayerOption = { id: string; label: string }

type Props = {
  visible: boolean
  onClose: () => void
  toggles: LayerToggle[]
  basemaps: LayerOption[]
  selectedBasemapId: string
  onSelectBasemap: (id: string) => void
  /** Copyright notice of the selected base map, shown at the bottom of the menu. */
  attribution?: string
}

/** The layer menu: stands and boundary on/off, and one base map. */
export function LayerSheet({ visible, onClose, toggles, basemaps, selectedBasemapId, onSelectBasemap, attribution }: Props) {
  const t = useTheme()
  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel="Close layers">
      {toggles.map((l) => (
        <Pressable key={l.id} onPress={l.onToggle} style={[styles.row, { borderColor: t.border }]}
          accessibilityRole="checkbox" accessibilityState={{ checked: l.on }}>
          <Text style={[styles.mark, { color: l.on ? t.accent : t.muted }]}>{l.on ? '☑' : '☐'}</Text>
          <Text style={[styles.label, { color: t.text }]}>{l.label}</Text>
        </Pressable>
      ))}
      <View style={[styles.divider, { backgroundColor: t.border }]} />
      {basemaps.map((b) => {
        const active = b.id === selectedBasemapId
        return (
          <Pressable key={b.id} onPress={() => onSelectBasemap(b.id)} style={[styles.row, { borderColor: t.border }]}
            accessibilityRole="radio" accessibilityState={{ selected: active }}>
            <Text style={[styles.mark, { color: active ? t.accent : 'transparent' }]}>✓</Text>
            <Text style={[styles.label, { color: t.text, fontWeight: active ? '600' : '400' }]} numberOfLines={1}>{b.label}</Text>
          </Pressable>
        )
      })}
      {attribution ? <Text style={[styles.attribution, { color: t.muted }]}>{attribution}</Text> : null}
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, height: 48 },
  mark: { width: 28, fontSize: 18, lineHeight: 22 },
  label: { fontSize: 16, lineHeight: 22, flexShrink: 1 },
  attribution: { fontSize: 11, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 20, marginVertical: 4 },
})
