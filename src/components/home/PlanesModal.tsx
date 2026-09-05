import { useCallback, useEffect, useState } from 'react'
import { Building2, Check, Loader2, MessageCircle, Sparkles, Users, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { listPlanes } from '../../services/planes'
import { getTipoCambioPublico, TIPO_CAMBIO_POR_DEFECTO } from '../../services/configuracion'
import { formatBs, formatUsd, usdABs } from '../../lib/currency'
import { enlaceWhatsapp } from '../../lib/whatsapp'
import { useBloqueoScroll } from '../../hooks/useBloqueoScroll'
import type { ModuloVetora, Plan } from '../../types/database'

/** Contacto comercial de Vetora — no es el WhatsApp de ninguna clínica. */
export const WHATSAPP_VETORA = '59178215518'

const MODULOS_LABEL: Partial<Record<ModuloVetora, string>> = {
  agenda: 'Agenda',
  caja: 'Caja',
  inventario: 'Inventario',
  historial_clinico: 'Historial Clínico (SOAP)',
  internacion: 'Internación',
  asistente_ia: 'Asistente IA',
  portal_cliente: 'Portal Clientes',
  whatsapp: 'Avisos WhatsApp',
  metricas: 'Métricas',
  catalogo: 'Catálogo',
  peluqueria: 'Peluquería',
  petshop: 'Pet Shop',
  fichas: 'Clientes y Pacientes',
  servicios: 'Servicios y Tarifas',
}

/**
 * Modal de planes de suscripción de Vetora.
 * 
 * Se actualiza AUTOMÁTICAMENTE en tiempo real en cuanto el superadmin
 * crea, modifica o desactiva planes desde el panel de administración
 * (vía suscripción Supabase Realtime + reconexión en foco).
 */
export function PlanesModal({ onClose }: { onClose: () => void }) {
  const [planes, setPlanes] = useState<Plan[]>([])
  const [tipoCambio, setTipoCambio] = useState(TIPO_CAMBIO_POR_DEFECTO)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useBloqueoScroll(true)

  const cargar = useCallback(async () => {
    try {
      const [lista, tc] = await Promise.all([
        listPlanes(true),
        getTipoCambioPublico(),
      ])
      setPlanes(lista)
      setTipoCambio(tc)
      setError(null)
    } catch {
      setError('No se pudieron cargar los planes. Inténtalo de nuevo en un momento.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()

    // ── Suscripción en tiempo real a cambios de planes en Supabase ──
    const canal = supabase
      .channel('realtime_planes_publicos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'planes' },
        () => {
          cargar()
        }
      )
      .subscribe()

    // Al regresar a la pestaña o ventana se refresca para evitar datos desfasados
    const onFocus = () => {
      cargar()
    }
    window.addEventListener('focus', onFocus)

    return () => {
      supabase.removeChannel(canal)
      window.removeEventListener('focus', onFocus)
    }
  }, [cargar])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto overscroll-contain p-5 sm:p-8 shadow-2xl border border-slate-100 relative animate-scale-in">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Cerrar modal"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-6 sm:mb-8">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200/60 mb-2">
            <Sparkles size={13} />
            Planes y Precios Oficiales
          </span>
          <h3 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Planes de Suscripción Vetora
          </h3>
          <p className="text-slate-500 text-sm mt-1 max-w-lg mx-auto">
            Elige el plan que mejor se adapte a tu veterinaria, clínica, peluquería o petshop. Actualizados en tiempo real.
          </p>
        </div>

        {cargando && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
            <Loader2 size={32} className="animate-spin text-teal-600" />
            <p className="text-xs font-medium text-slate-500">Cargando planes vigentes...</p>
          </div>
        )}

        {error && <p className="text-center text-sm text-rose-600 py-8">{error}</p>}

        {!cargando && !error && planes.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-8">Por ahora no hay planes en oferta disponibles.</p>
        )}

        {!cargando && !error && planes.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
            {planes.map((p) => {
              const mensaje = `Hola, quiero contratar el plan ${p.nombre} (${formatUsd(p.precio_mensual_usd)}/mes) de Vetora`
              const tieneIA = (p.ia_limite_redaccion ?? 0) > 0 || (p.ia_limite_copiloto ?? 0) > 0
              const modulos = (p.modulos_habilitados ?? [])
                .map((m) => MODULOS_LABEL[m])
                .filter(Boolean)

              return (
                <div
                  key={p.id}
                  className="p-5 rounded-2xl bg-slate-50/80 border border-slate-200/70 hover:border-teal-300 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-lg text-slate-900 tracking-tight">{p.nombre}</p>
                      {tieneIA && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          <Sparkles size={10} /> IA
                        </span>
                      )}
                    </div>

                    <div className="mt-2">
                      <p className="font-display text-2xl sm:text-3xl font-black text-slate-900">
                        {formatUsd(p.precio_mensual_usd)}
                        <span className="ml-1 text-xs font-semibold text-slate-400">/ mes</span>
                      </p>
                      <p className="text-xs font-medium text-slate-500 mt-0.5">
                        ≈ {formatBs(usdABs(p.precio_mensual_usd, tipoCambio))}
                      </p>
                    </div>

                    {/* Límites principales */}
                    <dl className="mt-4 space-y-1.5 text-xs text-slate-600 border-t border-slate-200 pt-3">
                      <div className="flex items-center gap-2">
                        <Building2 size={14} className="text-teal-600 shrink-0" />
                        <span><strong>{p.max_sucursales}</strong> sucursal(es)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users size={14} className="text-teal-600 shrink-0" />
                        <span><strong>{p.max_usuarios}</strong> usuario(s)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MessageCircle size={14} className="text-teal-600 shrink-0" />
                        <span><strong>{p.whatsapp_limite}</strong> WhatsApp/mes</span>
                      </div>
                    </dl>

                    {/* Módulos incluidos configurados por el superadmin */}
                    {modulos.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-200/60">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                          Incluye:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {modulos.map((m) => (
                            <span
                              key={m}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 shadow-xs"
                            >
                              <Check size={10} className="text-teal-600" />
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 mt-auto">
                    <a
                      href={enlaceWhatsapp(WHATSAPP_VETORA, mensaje)}
                      target="_blank"
                      rel="noreferrer"
                      className="clay-btn w-full block py-2.5 px-3 text-center text-xs sm:text-sm font-bold active:scale-95 transition-transform"
                    >
                      Contratar por WhatsApp
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
