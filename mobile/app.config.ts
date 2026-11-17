import type { ConfigContext, ExpoConfig } from 'expo/config'

// Two variants of the app can be installed side by side on one iPhone:
// - "Hunt Hub"     (default): the release build, JavaScript embedded, works without the Mac
// - "Hunt Hub Dev" (APP_VARIANT=development): loads its JavaScript from Metro on the Mac
// They differ in name, icon, bundle identifier and URL scheme. Everything else is in app.json.
const isDev = process.env.APP_VARIANT === 'development'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: isDev ? 'Hunt Hub Dev' : 'Hunt Hub',
  slug: config.slug ?? 'hunt-hub',
  scheme: isDev ? 'hunthub-dev' : 'hunthub',
  // Release: the Hunt Hub logo (same as the web favicon). Dev: the blue Expo icon.
  icon: isDev ? './assets/icon-dev.png' : config.icon,
  ios: {
    ...config.ios,
    bundleIdentifier: isDev ? `${config.ios?.bundleIdentifier}.dev` : config.ios?.bundleIdentifier,
  },
})
