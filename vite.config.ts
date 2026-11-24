import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// BASE_PATH lets the same build run at a domain root ("/") or in a
// sub-folder such as GitHub Pages ("/gym-companion/").
const base = process.env.BASE_PATH || '/'

export default defineConfig({
  base,
  build: { chunkSizeWarningLimit: 1000 },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // 0.0.0.0 = reachable from your phone on the same Wi-Fi (http://<computer-ip>:5173)
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  preview: { host: '0.0.0.0', port: 4173, strictPort: true },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' so an update never reloads the page in the middle of a workout.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'exercise-images/*'],
      manifest: {
        id: base,
        name: 'Gym Companion',
        short_name: 'Gym',
        description: 'Personal offline gym workout tracker',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f8fafc',
        theme_color: '#0f172a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the whole app INCLUDING every exercise image, so it works fully offline.
        globPatterns: ['**/*.{js,css,html,png,jpg,jpeg,svg,webp,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
      devOptions: { enabled: false },
    }),
  ],
})
