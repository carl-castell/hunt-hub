import { TRPCClientError } from '@trpc/client'
import { Redirect } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../auth/AuthProvider'
import { getDb } from '../db/database'
import { pendingChangeCount } from '../db/localData'
import { useTheme } from '../ui/theme'

function errorMessage(err: unknown) {
  if (err instanceof TRPCClientError) {
    if (err.data?.code === 'FORBIDDEN') return 'The app is only available to managers and staff.'
    if (err.data?.code === 'TOO_MANY_REQUESTS') return 'Account temporarily locked. Please try again later.'
    if (err.message && err.data) return err.message
  }
  return 'Could not reach the server. You need an internet connection to log in.'
}

function confirmDiscard(count: number) {
  return new Promise<boolean>((resolve) => Alert.alert(
    'Unsynced changes',
    `${count} change${count === 1 ? '' : 's'} from the previous user haven't been uploaded and will be lost.`,
    [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Log in anyway', style: 'destructive', onPress: () => resolve(true) },
    ],
  ))
}

export default function LoginScreen() {
  const t = useTheme()
  const { status, user, login } = useAuth()
  const [email, setEmail] = useState(user?.email ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status === 'signedIn') return <Redirect href="/" />

  const submit = async () => {
    setError(null)
    const pending = pendingChangeCount(getDb())
    const otherUser = user && user.email.toLowerCase() !== email.trim().toLowerCase()
    if (otherUser && pending > 0 && !(await confirmDiscard(pending))) return

    setBusy(true)
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]}>
      <KeyboardAvoidingView behavior="padding" style={styles.center}>
        <Text style={[styles.title, { color: t.text }]}>Hunt Hub</Text>
        {status === 'expired' && (
          <Text style={[styles.note, { color: t.muted }]}>
            Your session has expired. Log in again to continue syncing. Your offline data is kept.
          </Text>
        )}
        <TextInput
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }]}
          placeholder="Email" placeholderTextColor={t.muted}
          autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username"
          value={email} onChangeText={setEmail}
        />
        <TextInput
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }]}
          placeholder="Password" placeholderTextColor={t.muted}
          secureTextEntry autoComplete="password" textContentType="password"
          value={password} onChangeText={setPassword} onSubmitEditing={submit} returnKeyType="go"
        />
        {error && <Text style={[styles.error, { color: t.danger }]}>{error}</Text>}
        <Pressable
          style={[styles.button, { backgroundColor: t.accent, opacity: busy || !email || !password ? 0.6 : 1 }]}
          disabled={busy || !email || !password} onPress={submit}
        >
          {busy ? <ActivityIndicator color={t.accentText} /> : <Text style={[styles.buttonText, { color: t.accentText }]}>Log in</Text>}
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  title: { fontSize: 32, fontWeight: '700', marginBottom: 12 },
  note: { fontSize: 14, lineHeight: 20 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  error: { fontSize: 14 },
  button: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  buttonText: { fontSize: 16, fontWeight: '600' },
})
