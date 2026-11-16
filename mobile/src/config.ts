// Backend base URL. Set EXPO_PUBLIC_API_URL in mobile/.env.local, e.g.
//   EXPO_PUBLIC_API_URL=http://localhost:3000        (iOS simulator)
//   EXPO_PUBLIC_API_URL=http://192.168.1.20:3000     (real iPhone on the same Wi-Fi)
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')
export const TRPC_URL = `${API_URL}/api/v1/trpc`

export const ONLINE_TOPO = {
  tiles: ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
  maxzoom: 17,
  attribution: '© OpenTopoMap (CC-BY-SA), © OpenStreetMap contributors',
}

export const SYNC_INTERVAL_MS = 5 * 60 * 1000
