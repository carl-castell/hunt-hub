import { Redirect, Stack } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '../../auth/AuthProvider'

export default function AppLayout() {
  const { status } = useAuth()
  if (status === 'loading') {
    return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>
  }
  // Only a missing or rejected session sends the user to login, never being offline.
  if (status !== 'signedIn') return <Redirect href="/login" />

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Areas' }} />
      <Stack.Screen name="area/[id]" options={{ title: '' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
    </Stack>
  )
}
