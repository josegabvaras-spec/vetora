import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'

// Extender la interfaz de Window para admitir BeforeInstallPromptEvent
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Mostrar el prompt solo si no fue descartado previamente en la sesión actual
      if (!sessionStorage.getItem('pwaPromptDismissed')) {
        setShowPrompt(true)
      }
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setDeferredPrompt(null)
      setShowPrompt(false)
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    sessionStorage.setItem('pwaPromptDismissed', 'true')
  }

  if (!showPrompt) return null

  return (
    <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 md:bottom-6 md:left-auto md:right-6 md:w-96 animate-slide-up">
      <div className="flex items-start gap-4 rounded-2xl border border-teal-100 bg-white p-4 shadow-2xl ring-1 ring-black/5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
          <Download size={20} strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-sm font-bold text-slate-900">Instala Vetora App</h3>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">
            Instala nuestra aplicación para acceso rápido, uso en pantalla completa y una mejor experiencia.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={handleInstallClick} className="flex-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-teal-500">
              Instalar Ahora
            </button>
            <button onClick={handleDismiss} className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              Ahora No
            </button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="-mr-2 -mt-2 p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-50"
          aria-label="Cerrar"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
