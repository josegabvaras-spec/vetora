import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// @ts-expect-error - Vite PWA plugin virtual module
import { registerSW } from 'virtual:pwa-register'
import { instalarCapturaDeErrores } from './lib/errores'
import { instalarCapturaDePrompt } from './lib/pwa'
import { ErrorBoundary } from './components/layout/ErrorBoundary'

registerSW({ immediate: true })

// `beforeinstallprompt` se dispara una sola vez y muy pronto: hay que estar
// escuchando antes de montar React, o se pierde.
instalarCapturaDePrompt()

// Antes de montar la aplicación: si el fallo ocurre durante el primer render,
// engancharlo después llegaría tarde.
instalarCapturaDeErrores()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Por encima del router: es el único punto que cubre todo, incluido un
        fallo del propio enrutado. */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
