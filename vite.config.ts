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
      devOptions: {
        enabled: true
      }
    })
  ],
  build: {
    chunkSizeWarningLimit: 1600,
  },
})
