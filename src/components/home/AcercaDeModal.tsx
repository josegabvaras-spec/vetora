import { Info, ClipboardX, Sparkles, MapPin, X } from 'lucide-react'
import { useBloqueoScroll } from '../../hooks/useBloqueoScroll'

export function AcercaDeModal({ onClose, onVerPlanes }: { onClose: () => void; onVerPlanes: () => void }) {
  useBloqueoScroll(true)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 relative animate-scale-in">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Cerrar modal"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex p-3 rounded-2xl bg-slate-100 text-slate-700 mb-3">
            <Info size={28} />
          </div>
          <h3 className="font-display text-2xl font-bold text-slate-900">Acerca de Vetora</h3>
          <p className="text-slate-500 text-sm mt-1">
            Una plataforma de gestión veterinaria pensada para el negocio real, no para uno ideal.
          </p>
        </div>

        <div className="space-y-4 mb-6">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3">
            <ClipboardX className="text-rose-600 shrink-0 mt-0.5" size={20} />
            <div>
              <h4 className="font-bold text-slate-900 text-sm">El problema</h4>
              <p className="text-slate-500 text-xs mt-0.5">
                Muchas veterinarias en Bolivia todavía gestionan citas, historiales e inventario entre cuadernos,
                Excel y el WhatsApp personal de quien atiende.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3">
            <Sparkles className="text-teal-600 shrink-0 mt-0.5" size={20} />
            <div>
              <h4 className="font-bold text-slate-900 text-sm">Nuestra propuesta</h4>
              <p className="text-slate-500 text-xs mt-0.5">
                Centralizamos historial clínico, agenda, inventario y avisos automáticos por WhatsApp en un solo
                sistema, adaptado al tamaño real de cada negocio.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3">
            <MapPin className="text-amber-600 shrink-0 mt-0.5" size={20} />
            <div>
              <h4 className="font-bold text-slate-900 text-sm">Dónde operamos</h4>
              <p className="text-slate-500 text-xs mt-0.5">
                Hecho en Bolivia, para veterinarias, peluquerías y petshops bolivianos.
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={onVerPlanes} className="clay-btn flex-1 py-3 text-center text-sm font-bold">
            Ver Planes
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3 rounded-full text-slate-600 hover:bg-slate-100 font-semibold text-sm transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
