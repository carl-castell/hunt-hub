import { Redirect, Stack } from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '../../auth/AuthProvider'
import { offlineDownloads } from '../../offline/downloader'

export default function AppLayout() {
  const { status } = useAuth()
  // Offline map downloads that were running when the app was closed carry on.
  useEffect(() => { if (status === 'signedIn') offlineDownloads.resume() }, [status])
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
      {/* Back buttons only show the arrow, not the previous page's title. */}
      <Stack.Screen name="stands/[areaId]" options={{ title: 'Stands', headerBackButtonDisplayMode: 'minimal' }} />
      <Stack.Screen name="offline/new" options={{ title: 'Choose an area', headerBackButtonDisplayMode: 'minimal' }} />
      <Stack.Screen name="offline/[id]" options={{ title: 'Offline map', headerBackButtonDisplayMode: 'minimal' }} />
      <Stack.Screen name="stand/[id]" options={{ title: 'Stand', headerBackButtonDisplayMode: 'minimal' }} />
    </Stack>
  )
}
