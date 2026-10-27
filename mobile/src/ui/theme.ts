import { useColorScheme } from 'react-native'

const light = {
  bg: '#f6f5f0', card: '#ffffff', text: '#1d1f1a', muted: '#6b6f63', border: '#dedcd2',
  accent: '#d9480f', accentText: '#ffffff', danger: '#c92a2a', ok: '#2b8a3e', warn: '#e67700',
}
const dark: typeof light = {
  bg: '#14150f', card: '#1f211a', text: '#eceee6', muted: '#9a9e90', border: '#33362b',
  accent: '#ff6b2c', accentText: '#14150f', danger: '#ff6b6b', ok: '#51cf66', warn: '#ffa94d',
}

export function useTheme() {
  return useColorScheme() === 'dark' ? dark : light
}
