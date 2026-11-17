import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { STAND_STATUS_COLORS, STAND_STATUS_LABELS, STAND_STATUSES, type StandStatus } from '../stands/status'
import { BottomSheet } from './BottomSheet'
import { useTheme } from './theme'

export type EditableStand = { id: number; number: string; nickname: string | null; status: StandStatus | null }

/**
 * Edit mode: nickname and status of a stand. A new status gets today's date
 * automatically (corrected on the website or in QGIS if needed).
 */
export function StandDetailsSheet({ stand, onSave, onCancel }: {
  stand: EditableStand | null
  onSave: (changes: { nickname: string | null; status: StandStatus | null }) => void
  onCancel: () => void
}) {
  const t = useTheme()
  const [nickname, setNickname] = useState('')
  const [status, setStatus] = useState<StandStatus | null>(null)
  useEffect(() => {
    if (!stand) return
    setNickname(stand.nickname ?? '')
    setStatus(stand.status)
  }, [stand])

  const options: (StandStatus | null)[] = [...STAND_STATUSES, null]

  return (
    <BottomSheet visible={stand !== null} onClose={onCancel} closeLabel="Cancel">
      {stand && (
        <View style={styles.body}>
          <Text style={[styles.title, { color: t.text }]}>Stand {stand.number}</Text>
          <TextInput
            value={nickname} onChangeText={setNickname} placeholder="Nickname (optional)" placeholderTextColor={t.muted}
            autoCorrect={false} returnKeyType="done" maxLength={64} accessibilityLabel="Nickname"
            style={[styles.input, { backgroundColor: t.bg, color: t.text, borderColor: t.border }]}
          />
          <Text style={[styles.label, { color: t.muted }]}>Status</Text>
          <View style={styles.options} accessibilityRole="radiogroup">
            {options.map((code) => {
              const active = status === code
              return (
                <Pressable key={code ?? 'none'} onPress={() => setStatus(code)}
                  accessibilityRole="radio" accessibilityState={{ selected: active }}
                  style={[styles.option, { borderColor: active ? t.accent : t.border }, active && { backgroundColor: t.bg }]}>
                  <View style={[styles.dot, { backgroundColor: code ? STAND_STATUS_COLORS[code] : 'transparent', borderColor: t.border, borderWidth: code ? 0 : 1 }]} />
                  <Text style={{ color: t.text, fontSize: 15, fontWeight: active ? '600' : '400' }}>
                    {code ? STAND_STATUS_LABELS[code] : 'Not checked'}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          {status !== stand.status && status !== null && (
            <Text style={{ color: t.muted }}>The status date will be today.</Text>
          )}
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={[styles.button, { borderColor: t.border, borderWidth: 1 }]}>
              <Text style={[styles.buttonText, { color: t.text }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => onSave({ nickname: nickname.trim() || null, status })}
              style={[styles.button, { backgroundColor: t.accent }]}>
              <Text style={[styles.buttonText, { color: t.accentText }]}>Save</Text>
            </Pressable>
          </View>
        </View>
      )}
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 17, marginTop: 4 },
  label: { fontSize: 13, marginTop: 4 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 44,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  button: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' },
})
