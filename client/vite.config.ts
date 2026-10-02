import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import packageJson from './package.json'

// https://vite.dev/config/
export default defineConfig({
  define: {
    '__APP_VERSION__': JSON.stringify(packageJson.version)
  },
  plugins: [
    react(),
    {
      name: 'wishlist-release-metadata',
      transformIndexHtml: { order: 'post', handler: () => [{ tag: 'meta', attrs: { name: 'wishlist-web-version', content: packageJson.version }, injectTo: 'head' }] },
      generateBundle() { this.emitFile({ type: 'asset', fileName: 'web-version.json', source: JSON.stringify({ version: packageJson.version }) }); },
    },
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // The UI owns registration and never automatically reloads forms.
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Wishlist.ai',
        short_name: 'Wishlist.ai',
        description: 'Your intelligent wishlist manager.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/logo.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/logo.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        // injectRegister:false disables the plugin's automatic defaults.
        // Prepare/claim the new shell without reloading any open form; the
        // UI still requires explicit confirmation before page navigation.
        skipWaiting: true,
        clientsClaim: true,
        importScripts: ['/pwa-cache-policy.js'],
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        globIgnores: ['**/web-version.json'], // Read current server metadata, never the worker's old version.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],  // Don't serve index.html for /api/* routes
        runtimeCaching: [
          {
            // Cache only bundled public artwork, never product/owner photos.
            // CacheFirst would otherwise bypass API no-store after removal/logout.
            urlPattern: ({ request, url, sameOrigin }) => request.destination === 'image' &&
              sameOrigin && !url.search &&
              ['/features/feature1.png', '/features/feature2.png', '/features/feature3.png', '/features/feature4.png', '/logo.png', '/favicon.ico', '/apple-touch-icon.png', '/masked-icon.svg'].includes(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'wishlist-public-artwork-v1',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 Days
              },
            },
          },
        ]
      }
    })
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
