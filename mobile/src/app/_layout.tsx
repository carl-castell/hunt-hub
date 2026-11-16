import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider } from '../auth/AuthProvider'
import { SyncProvider } from '../sync/SyncProvider'

export default function RootLayout() {
  return (
    <AuthProvider>
      <SyncProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(app)" />
          <Stack.Screen name="login" options={{ animation: 'fade' }} />
        </Stack>
      </SyncProvider>
    </AuthProvider>
  )
}
