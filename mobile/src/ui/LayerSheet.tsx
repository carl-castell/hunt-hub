import { useEffect, useRef, useState } from 'react'
import { Animated, Dimensions, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
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

const HIDDEN = Dimensions.get('window').height

/**
 * The layer menu: slides up from the bottom and is only as tall as its list.
 * Closes on a swipe down or a tap on the map above it.
 */
export function LayerSheet({ visible, onClose, toggles, basemaps, selectedBasemapId, onSelectBasemap, attribution }: Props) {
  const t = useTheme()
  const translateY = useRef(new Animated.Value(HIDDEN)).current
  const [mounted, setMounted] = useState(visible)

  useEffect(() => {
    if (visible) {
      setMounted(true)
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 16 }).start()
    } else {
      Animated.timing(translateY, { toValue: HIDDEN, duration: 200, useNativeDriver: true }).start(() => setMounted(false))
    }
  }, [visible, translateY])

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => translateY.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy > 60 || g.vy > 0.5) onCloseRef.current()
      else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start()
    },
  })).current
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  if (!mounted) return null

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close layers" />
      <Animated.View
        {...pan.panHandlers}
        style={[styles.sheet, { backgroundColor: t.card, transform: [{ translateY }] }]}
      >
        <SafeAreaView edges={['bottom']}>
          <View style={styles.handleArea}><View style={[styles.handle, { backgroundColor: t.border }]} /></View>
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
        </SafeAreaView>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: -2 },
  },
  handleArea: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 40, height: 5, borderRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, height: 48 },
  mark: { width: 28, fontSize: 18, lineHeight: 22 },
  label: { fontSize: 16, lineHeight: 22, flexShrink: 1 },
  attribution: { fontSize: 11, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 20, marginVertical: 4 },
})
