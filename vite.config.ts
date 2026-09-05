import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Exoplanet Explorer 3D',
        short_name: 'ExoExplorer',
        description: 'Explore 5,700+ exoplanets in interactive 3D',
        theme_color: '#020617',
        background_color: '#020617',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three') || id.includes('node_modules/@react-three')) {
            return 'three-vendor'
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/zustand') || id.includes('node_modules/lucide')) {
            return 'react-vendor'
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 3001,
    strictPort: false,
    proxy: {
      // Our own catalog API (server/). Start it with:
      //   docker compose up -d db redis
      //   cd server && .venv/Scripts/python -m uvicorn app.main:app --reload
      //
      // Override the target with API_PROXY_TARGET when the API is not on 8000 (a port
      // another project is already using, say).
      '/api/v1': {
        target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000',
        changeOrigin: true,
        // Presence runs over /api/v1/ws/presence, and a WebSocket upgrade is not
        // forwarded unless the proxy is told to expect one.
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Share links and their preview cards. Served by the API rather than by the app
      // because only the API can put this link's planet into the Open Graph tags.
      //
      // A regular expression rather than the plain `/s` prefix a proxy entry usually is:
      // `/s` would also swallow `/src/main.tsx`, and the dev server would stop being able
      // to serve its own source. The pattern is the slug alphabet from server/app/share.py
      // (Crockford base32 — no i, l, o or u) at its exact length, so only a real link
      // matches. No rewrite: the API serves these paths under the same names.
      '^/s/[0-9a-hjkmnp-tv-z]{10}(/card\\.png)?$': {
        target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      // Legacy direct-to-NASA path, kept only as the degraded fallback for when the
      // catalog API is not running. See services/nasaApi.ts.
      '/api/nasa': {
        target: 'https://exoplanetarchive.ipac.caltech.edu',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nasa/, ''),
      },
    },
  },
})
