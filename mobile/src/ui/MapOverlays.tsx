import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Ring } from '../map/scale'
import { useTheme } from './theme'

/** Round map button, e.g. layers or my location. */
export function MapButton({ symbol, label, active = false, onPress }: { symbol: string; label: string; active?: boolean; onPress: () => void }) {
  const t = useTheme()
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={4}
      style={[styles.button, { backgroundColor: active ? t.accent : t.card }]}>
      <Text style={[styles.symbol, { color: active ? t.accentText : t.text }]}>{symbol}</Text>
    </Pressable>
  )
}

/** Very thin cross that marks the map centre (the point whose coordinates are shown). */
export function Crosshair() {
  return (
    <View style={styles.crossWrap} pointerEvents="none">
      <View style={styles.haloH} />
      <View style={styles.haloV} />
      <View style={styles.lineH} />
      <View style={styles.lineV} />
    </View>
  )
}

/** Compass button, shown while the map is rotated. Points north; a tap turns the map back to north. */
export function CompassButton({ bearing, onPress }: { bearing: number; onPress: () => void }) {
  const t = useTheme()
  return (
    <Pressable onPress={onPress} accessibilityLabel="Turn map to north" hitSlop={4}
      style={[styles.button, { backgroundColor: t.card }]}>
      <View style={[styles.needle, { transform: [{ rotate: `${-bearing}deg` }] }]}>
        <Text style={styles.needleNorth}>▲</Text>
        <Text style={[styles.needleN, { color: t.text }]}>N</Text>
      </View>
    </Pressable>
  )
}

/** Distance rings around the map centre, each labelled with its distance. */
export function DistanceRings({ rings }: { rings: Ring[] }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {rings.map((r) => (
        <View key={r.label} style={[styles.ring, { width: r.radius * 2, height: r.radius * 2, borderRadius: r.radius, marginLeft: -r.radius, marginTop: -r.radius }]}>
          <Text style={styles.ringLabel}>{r.label}</Text>
        </View>
      ))}
    </View>
  )
}

/** Bottom of the map: centre coordinates and GPS accuracy. */
export function MapInfoBar({ coordinate, accuracy, bottomInset }: {
  coordinate: string | null
  accuracy: string | null
  bottomInset: number
}) {
  const t = useTheme()
  return (
    <View style={[styles.info, { paddingBottom: bottomInset + 6 }]} pointerEvents="none">
      {(coordinate || accuracy) && (
        <View style={[styles.pill, { backgroundColor: t.card }]}>
          <Text style={[styles.infoText, { color: t.text }]} numberOfLines={1}>
            {[coordinate, accuracy].filter(Boolean).join('  ·  ')}
          </Text>
        </View>
      )}
    </View>
  )
}

const CROSS = 28

const styles = StyleSheet.create({
  button: {
    width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  symbol: { fontSize: 21 },
  crossWrap: { position: 'absolute', top: '50%', left: '50%', width: CROSS, height: CROSS, marginLeft: -CROSS / 2, marginTop: -CROSS / 2 },
  lineH: { position: 'absolute', left: 0, right: 0, top: CROSS / 2 - 0.25, height: 0.5, backgroundColor: '#000' },
  lineV: { position: 'absolute', top: 0, bottom: 0, left: CROSS / 2 - 0.25, width: 0.5, backgroundColor: '#000' },
  // A slightly wider white line below each black one keeps the cross visible on dark satellite images.
  haloH: { position: 'absolute', left: 0, right: 0, top: CROSS / 2 - 0.75, height: 1.5, backgroundColor: 'rgba(255,255,255,0.8)' },
  haloV: { position: 'absolute', top: 0, bottom: 0, left: CROSS / 2 - 0.75, width: 1.5, backgroundColor: 'rgba(255,255,255,0.8)' },
  info: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 4 },
  pill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, opacity: 0.92 },
  infoText: { fontSize: 13, fontVariant: ['tabular-nums'] },
  needle: { alignItems: 'center' },
  needleNorth: { fontSize: 11, lineHeight: 12, color: '#c92a2a' },
  needleN: { fontSize: 13, lineHeight: 15, fontWeight: '700' },
  ring: {
    position: 'absolute', top: '50%', left: '50%', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(29,31,26,0.75)',
  },
  // The label sits on the top of the ring.
  ringLabel: {
    marginTop: -8, fontSize: 11, lineHeight: 14, fontWeight: '600', color: '#1d1f1a',
    backgroundColor: 'rgba(255,255,255,0.8)', paddingHorizontal: 4, borderRadius: 4, overflow: 'hidden',
  },
})
