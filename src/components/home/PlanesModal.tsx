import { useEffect, useState } from 'react'
import { Building2, Loader2, MessageCircle, Users, X } from 'lucide-react'
import { listPlanes } from '../../services/planes'
import { TIPO_CAMBIO_POR_DEFECTO } from '../../services/configuracion'
import { formatBs, formatUsd, usdABs } from '../../lib/currency'
import { enlaceWhatsapp } from '../../lib/whatsapp'
import { useBloqueoScroll } from '../../hooks/useBloqueoScroll'
import type { Plan } from '../../types/database'

/** Contacto comercial de Vetora — no es el WhatsApp de ninguna clínica. */
const WHATSAPP_VETORA = '59178215518'

/**
 * Los planes de suscripción de Vetora, para quien está evaluando contratar el
 * sistema. `planes_select` (0001) es `using (true)` sin `to authenticated`:
 * un visitante anónimo ya puede leer la tabla completa, así que no hace falta
 * ninguna función `security definer` como sí necesitó `clinicas_para_registro()`
 * — `planes` no tiene ninguna columna que no deba verse públicamente.
 *
 * El tipo de cambio real no está disponible sin sesión (`configuracion_plataforma`
 * se cerró en 0020, guarda datos bancarios): se usa `TIPO_CAMBIO_POR_DEFECTO`
 * para el «≈ Bs.», el mismo respaldo que ya usa el resto de la app.
 *
 * Contratar no es autoservicio — no hay alta pública de clínicas — así que la
 * acción es un enlace de WhatsApp (`enlaceWhatsapp`, puro, sin cuota), mismo
 * patrón que el botón de la Tienda del catálogo.
 */
export function PlanesModal({ onClose }: { onClose: () => void }) {
  const [planes, setPlanes] = useState<Plan[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Este modal solo existe montado mientras está abierto (el padre hace
  // `{planesAbierto && <PlanesModal .../>}`), así que basta con bloquear
  // siempre que el componente vive.
  useBloqueoScroll(true)

  useEffect(() => {
    listPlanes(true)
      .then(setPlanes)
      .catch(() => setError('No se pudieron cargar los planes. Inténtalo de nuevo en un momento.'))
      .finally(() => setCargando(false))
  }, [])

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
          <h3 className="font-display text-2xl font-bold text-slate-900">Planes de Vetora</h3>
          <p className="text-slate-500 text-sm mt-1">Elige el que se ajuste a tu clínica, peluquería o petshop.</p>
        </div>

        {cargando && (
          <div className="flex justify-center py-10 text-slate-400">
            <Loader2 size={28} className="animate-spin" />
          </div>
        )}

        {error && <p className="text-center text-sm text-rose-600 py-6">{error}</p>}

        {!cargando && !error && planes.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-6">Por ahora no hay planes en oferta.</p>
        )}

        {!cargando && !error && planes.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {planes.map((p) => {
              const mensaje = `Hola, quiero contratar el plan ${p.nombre} (${formatUsd(p.precio_mensual_usd)}/mes) de Vetora`
              return (
                <div key={p.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col">
                  <p className="font-bold text-slate-900">{p.nombre}</p>
                  <p className="font-display text-2xl font-black text-slate-900 mt-1">
                    {formatUsd(p.precio_mensual_usd)}
                    <span className="ml-1 text-xs font-semibold text-slate-400">/ mes</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    ≈ {formatBs(usdABs(p.precio_mensual_usd, TIPO_CAMBIO_POR_DEFECTO))}
                  </p>

                  <dl className="mt-3 space-y-1 text-xs text-slate-600 border-t border-slate-200 pt-3">
                    <div className="flex items-center gap-1.5">
                      <Building2 size={13} className="text-slate-400" /> {p.max_sucursales} sucursal(es)
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users size={13} className="text-slate-400" /> {p.max_usuarios} usuarios
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MessageCircle size={13} className="text-slate-400" /> {p.whatsapp_limite} WhatsApp/mes
                    </div>
                  </dl>

                  <a
                    href={enlaceWhatsapp(WHATSAPP_VETORA, mensaje)}
                    target="_blank"
                    rel="noreferrer"
                    className="clay-btn mt-4 py-2.5 text-center text-sm font-bold"
                  >
                    Contratar por WhatsApp
                  </a>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
