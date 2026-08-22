import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// @ts-expect-error - Vite PWA plugin virtual module
import { registerSW } from 'virtual:pwa-register'
import { instalarCapturaDeErrores } from './lib/errores'

registerSW({ immediate: true })

// Antes de montar la aplicación: si el fallo ocurre durante el primer render,
// engancharlo después llegaría tarde.
instalarCapturaDeErrores()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
