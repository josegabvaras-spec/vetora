import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vetoraicono.png', 'vetoralogo.png'],
      manifest: {
        name: 'Vetora - SaaS Clínico',
        short_name: 'Vetora',
        description: 'Gestión Veterinaria Profesional',
        theme_color: '#0d9488',
        background_color: '#f8fafc',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'vetoraicono.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'vetoraicono.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      // El service worker solo en producción. Registrarlo en desarrollo deja
      // cacheado el origen y sobrevive a los reinicios de Vite: es lo que hacía
      // que Workbox respondiera `/` con recursos de un puerto ya muerto.
      // Para probar el PWA en local: npm run build && npm run preview.
      devOptions: {
        enabled: false
      }
    })
  ],
  server: {
    watch: {
      // El watcher vigila la raíz entera y tumbaba el servidor con
      // `EBUSY: resource busy or locked` al toparse con .agents/. Nada de esto
      // lo importa la aplicación, así que no hay motivo para vigilarlo.
      ignored: ['**/.agents/**', '**/.claude/**', '**/dev-dist/**', '**/supabase/**'],
    },
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
})
