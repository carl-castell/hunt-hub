import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { BottomSheet } from './BottomSheet'
import { useTheme } from './theme'

export type LocationChoice = {
  atGps: boolean
  hasGps: boolean
  /** GPS accuracy in metres, shown with the GPS option. */
  gpsAccuracy?: number | null
  onChange: (atGps: boolean) => void
}

/**
 * Asks for the number of a new stand, and where it goes (where the map was
 * pressed or the GPS position). `error` is shown under the field.
 */
export function StandFormSheet({ visible, title, subtitle, location, error, onSave, onCancel }: {
  visible: boolean
  title: string
  /** The chosen position as text, e.g. the coordinates. */
  subtitle?: string
  location?: LocationChoice
  error?: string | null
  onSave: (number: string) => void
  onCancel: () => void
}) {
  const t = useTheme()
  const [number, setNumber] = useState('')
  useEffect(() => { if (visible) setNumber('') }, [visible])
  const canSave = number.trim().length > 0

  return (
    <BottomSheet visible={visible} onClose={onCancel} closeLabel="Cancel">
      <View style={styles.body}>
        <Text style={[styles.title, { color: t.text }]}>{title}</Text>
        {location?.hasGps && (
          <View style={[styles.segments, { borderColor: t.border }]} accessibilityRole="radiogroup">
            {[
              { gps: false, label: 'Selected location' },
              { gps: true, label: location.gpsAccuracy != null ? `Actual location (GPS ± ${Math.max(1, Math.round(location.gpsAccuracy))} m)` : 'Actual location (GPS)' },
            ].map((o) => {
              const active = location.atGps === o.gps
              return (
                <Pressable key={o.label} onPress={() => location.onChange(o.gps)} accessibilityRole="radio" accessibilityState={{ selected: active }}
                  style={[styles.segment, active && { backgroundColor: t.accent }]}>
                  <Text style={{ color: active ? t.accentText : t.text, fontSize: 13, fontWeight: active ? '600' : '400', textAlign: 'center' }} numberOfLines={2}>{o.label}</Text>
                </Pressable>
              )
            })}
          </View>
        )}
        {subtitle && <Text style={{ color: t.muted, fontVariant: ['tabular-nums'] }}>{subtitle}</Text>}
        <TextInput
          value={number} onChangeText={setNumber} placeholder="Stand number" placeholderTextColor={t.muted}
          autoFocus autoCorrect={false} autoCapitalize="none" returnKeyType="done" maxLength={32}
          onSubmitEditing={() => canSave && onSave(number)} accessibilityLabel="Stand number"
          style={[styles.input, { backgroundColor: t.bg, color: t.text, borderColor: error ? t.danger : t.border }]}
        />
        {error ? <Text style={{ color: t.danger }}>{error}</Text> : null}
        <View style={styles.actions}>
          <Pressable onPress={onCancel} style={[styles.button, { borderColor: t.border, borderWidth: 1 }]}>
            <Text style={[styles.buttonText, { color: t.text }]}>Cancel</Text>
          </Pressable>
          <Pressable onPress={() => onSave(number)} disabled={!canSave}
            style={[styles.button, { backgroundColor: t.accent, opacity: canSave ? 1 : 0.5 }]}>
            <Text style={[styles.buttonText, { color: t.accentText }]}>Save</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  segments: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, overflow: 'hidden', marginTop: 2 },
  segment: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 17, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  button: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' },
})
