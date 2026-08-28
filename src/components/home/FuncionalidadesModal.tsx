import {
  CalendarCheck,
  ClipboardList,
  Syringe,
  Boxes,
  Wallet,
  BedDouble,
  MessageCircle,
  Smartphone,
  Store,
  Building2,
  LayoutGrid,
  X,
} from 'lucide-react'
import { useBloqueoScroll } from '../../hooks/useBloqueoScroll'

const FUNCIONALIDADES = [
  { icon: CalendarCheck, titulo: 'Agenda y citas', detalle: 'Calendario sin cruces por veterinario.' },
  { icon: ClipboardList, titulo: 'Historial clínico', detalle: 'Consultas, recetas y estudios centralizados.' },
  { icon: Syringe, titulo: 'Esquema sanitario', detalle: 'Vacunas y desparasitación con refuerzos.' },
  { icon: Boxes, titulo: 'Inventario', detalle: 'Stock con alerta de nivel bajo.' },
  { icon: Wallet, titulo: 'Caja y cobros', detalle: 'Cobros del día y recibos simples.' },
  { icon: BedDouble, titulo: 'Internación', detalle: 'Seguimiento de pacientes internados.' },
  { icon: MessageCircle, titulo: 'Avisos por WhatsApp', detalle: 'Recordatorios de citas y refuerzos.' },
  { icon: Smartphone, titulo: 'Portal del cliente', detalle: 'El dueño ve el historial desde su celular.' },
  { icon: Store, titulo: 'Catálogo y Tienda', detalle: 'Vitrina de productos para petshops y clínicas.' },
  { icon: Building2, titulo: 'Multi-sucursal', detalle: 'Varias sucursales bajo una sola cuenta.' },
]

export function FuncionalidadesModal({ onClose, onVerPlanes }: { onClose: () => void; onVerPlanes: () => void }) {
  useBloqueoScroll(true)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-y-auto overscroll-contain p-6 sm:p-8 shadow-2xl border border-slate-100 relative animate-scale-in">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Cerrar modal"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex p-3 rounded-2xl bg-teal-100 text-teal-700 mb-3">
            <LayoutGrid size={28} />
          </div>
          <h3 className="font-display text-2xl font-bold text-slate-900">Funcionalidades de Vetora</h3>
          <p className="text-slate-500 text-sm mt-1">
            Todo lo que tu clínica, peluquería o petshop tiene disponible al contratar el sistema.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 mb-6">
          {FUNCIONALIDADES.map(({ icon: Icon, titulo, detalle }) => (
            <div key={titulo} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3">
              <Icon className="text-teal-600 shrink-0 mt-0.5" size={18} />
              <div>
                <h4 className="font-bold text-slate-900 text-sm">{titulo}</h4>
                <p className="text-slate-500 text-xs mt-0.5">{detalle}</p>
              </div>
            </div>
          ))}
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
