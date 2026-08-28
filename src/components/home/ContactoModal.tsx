import { MessageCircle, X } from 'lucide-react'
import { enlaceWhatsapp } from '../../lib/whatsapp'
import { useBloqueoScroll } from '../../hooks/useBloqueoScroll'
import { WHATSAPP_VETORA } from './PlanesModal'

const MENSAJE = 'Hola, quiero más información sobre Vetora'

export function ContactoModal({ onClose }: { onClose: () => void }) {
  useBloqueoScroll(true)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-100 relative animate-scale-in text-center">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Cerrar modal"
        >
          <X size={20} />
        </button>

        <div className="inline-flex p-3 rounded-2xl bg-emerald-100 text-emerald-700 mb-3">
          <MessageCircle size={28} />
        </div>

        <h3 className="font-display text-2xl font-bold text-slate-900">Contáctanos</h3>
        <p className="text-slate-500 text-sm mt-2">
          Nuestro canal de contacto es WhatsApp: escríbenos para consultas sobre el sistema, planes o soporte.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <a
            href={enlaceWhatsapp(WHATSAPP_VETORA, MENSAJE)}
            target="_blank"
            rel="noreferrer"
            className="clay-btn w-full py-3 flex items-center justify-center gap-2 text-sm font-bold"
          >
            <MessageCircle size={16} />
            Escribir por WhatsApp
          </a>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-full text-slate-600 hover:bg-slate-100 font-semibold text-sm transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
