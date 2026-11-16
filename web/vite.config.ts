import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// The React app lives under /app, next to the server-rendered pages of the
// backend. In development every other path (/manager, /login, /api, static
// files …) is proxied to the backend, so both share one origin and one
// session cookie, exactly like in production.
const BACKEND_URL = 'http://localhost:3000'

export default defineConfig({
  base: '/app/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '^/(?!app(/|$)).*': BACKEND_URL,
    },
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
})
