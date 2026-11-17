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

/** Very thin cross that marks the map centre. `small`: only marks the centre of the distance rings. */
export function Crosshair({ small = false }: { small?: boolean }) {
  const size = small ? 12 : 28
  const half = size / 2
  const box = { width: size, height: size, marginLeft: -half, marginTop: -half }
  return (
    <View style={[styles.crossWrap, box]} pointerEvents="none">
      {/* A slightly wider white line below each black one keeps the cross visible on dark satellite images. */}
      <View style={[styles.lineH, { top: half - 0.75, height: 1.5 }, styles.halo]} />
      <View style={[styles.lineV, { left: half - 0.75, width: 1.5 }, styles.halo]} />
      <View style={[styles.lineH, { top: half - 0.25, height: 0.5 }]} />
      <View style={[styles.lineV, { left: half - 0.25, width: 0.5 }]} />
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

/** Colours of the distance rings: a line plus a halo in the opposite colour, so they stand out on any map. */
export type RingColors = { line: string; halo: string }
export const RINGS_ON_DARK: RingColors = { line: '#ffffff', halo: 'rgba(0,0,0,0.65)' }
export const RINGS_ON_LIGHT: RingColors = { line: '#1d1f1a', halo: 'rgba(255,255,255,0.9)' }

/** Distance rings around the map centre, each labelled at its top. */
export function DistanceRings({ rings, colors }: { rings: Ring[]; colors: RingColors }) {
  const circle = (radius: number, width: number, color: string) => ({
    width: radius * 2, height: radius * 2, borderRadius: radius, marginLeft: -radius, marginTop: -radius,
    borderWidth: width, borderColor: color,
  })
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {rings.map((r) => (
        <View key={r.label} style={StyleSheet.absoluteFill}>
          {/* A wider ring in the opposite colour below the thin one keeps it visible on any map. */}
          <View style={[styles.ring, circle(r.radius + 1, 3, colors.halo)]} />
          <View style={[styles.ring, circle(r.radius, 1, colors.line)]} />
          <Text numberOfLines={1}
            style={[styles.ringLabel, { color: colors.line, textShadowColor: colors.halo, marginTop: -r.radius - RING_LABEL_HEIGHT - 1 }]}>
            {r.label}
          </Text>
        </View>
      ))}
    </View>
  )
}

/** Bottom of the map: one main line (coordinates) and one smaller line below it. */
export function MapInfoBar({ main, sub, bottomInset }: { main: string | null; sub: string | null; bottomInset: number }) {
  const t = useTheme()
  if (!main && !sub) return null
  return (
    <View style={[styles.info, { paddingBottom: bottomInset + 6 }]} pointerEvents="none">
      <View style={[styles.pill, { backgroundColor: t.card }]}>
        {main && <Text style={[styles.infoText, { color: t.text }]} numberOfLines={1}>{main}</Text>}
        {sub && <Text style={[styles.infoSub, { color: t.muted }]} numberOfLines={1}>{sub}</Text>}
      </View>
    </View>
  )
}

const RING_LABEL_HEIGHT = 14

const styles = StyleSheet.create({
  button: {
    width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  symbol: { fontSize: 21 },
  crossWrap: { position: 'absolute', top: '50%', left: '50%' },
  lineH: { position: 'absolute', left: 0, right: 0, backgroundColor: '#000' },
  lineV: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#000' },
  halo: { backgroundColor: 'rgba(255,255,255,0.8)' },
  info: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 4 },
  pill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, opacity: 0.92 },
  infoText: { fontSize: 13, fontVariant: ['tabular-nums'], textAlign: 'center' },
  infoSub: { fontSize: 12, fontVariant: ['tabular-nums'], textAlign: 'center', marginTop: 1 },
  needle: { alignItems: 'center' },
  needleNorth: { fontSize: 11, lineHeight: 12, color: '#c92a2a' },
  needleN: { fontSize: 13, lineHeight: 15, fontWeight: '700' },
  // No background: a halo (text shadow) in the opposite colour keeps the number readable on any map.
  ring: { position: 'absolute', top: '50%', left: '50%' },
  ringLabel: {
    position: 'absolute', top: '50%', left: 0, right: 0, textAlign: 'center',
    fontSize: 11, lineHeight: RING_LABEL_HEIGHT, fontWeight: '700', textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 },
  },
})
