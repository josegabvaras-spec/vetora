import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import {
  pedirInstalacion,
  promptDeInstalacion,
  suscribirseAlPrompt,
  yaEstaInstalada,
} from '../../lib/pwa'

/**
 * Aviso para instalar la aplicación.
 *
 * No escucha el evento por su cuenta: lo captura `lib/pwa.ts` al arrancar. Este
 * componente se monta después de iniciar sesión, y para entonces
 * `beforeinstallprompt` ya se disparó — por eso antes no aparecía nunca.
 */
export function PWAInstallPrompt() {
  const [disponible, setDisponible] = useState(() => promptDeInstalacion() !== null)
  const [descartado, setDescartado] = useState(
    () => sessionStorage.getItem('pwaPromptDismissed') === 'true',
  )

  useEffect(() => suscribirseAlPrompt(() => setDisponible(promptDeInstalacion() !== null)), [])

  if (!disponible || descartado || yaEstaInstalada()) return null

  function descartar() {
    setDescartado(true)
    sessionStorage.setItem('pwaPromptDismissed', 'true')
  }

  return (
    <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 md:bottom-6 md:left-auto md:right-6 md:w-96 animate-slide-up">
      <div className="flex items-start gap-4 rounded-2xl border border-teal-100 bg-white p-4 shadow-2xl ring-1 ring-black/5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
          <Download size={20} strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-sm font-bold text-slate-900">Instala Vetora</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Queda como una aplicación más del celular: se abre a pantalla completa y sin la barra del navegador.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => pedirInstalacion()}
              className="flex-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-teal-500"
            >
              Instalar
            </button>
            <button
              onClick={descartar}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Ahora no
            </button>
          </div>
        </div>
        <button
          onClick={descartar}
          className="-mr-2 -mt-2 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
          aria-label="Cerrar"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
