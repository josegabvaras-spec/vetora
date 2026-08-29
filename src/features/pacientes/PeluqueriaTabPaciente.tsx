import { useEffect, useState, useCallback } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import {
  Scissors,
  Sparkles,
  Camera,
  Plus,
} from 'lucide-react'
import { formatBs } from '../../lib/currency'
import { formatClinicDate, formatClinicDateTime } from '../../lib/datetime'
import {
  getFichaGrooming,
  listOrdenes,
  listFotosDePaciente,
  ESTADO_ORDEN_LABEL,
  ESTADO_ORDEN_TONE,
  COMPORTAMIENTO_LABEL,
} from '../../services/peluqueria'
import type { PeluqueriaFicha, PeluqueriaFoto } from '../../types/database'
import type { PeluqueriaOrdenConDetalle } from '../../types/views'
import { FichaGroomingModal } from '../peluqueria/FichaGroomingModal'
import { OrdenDetalleModal } from '../peluqueria/OrdenDetalleModal'
import { NuevaOrdenModal } from '../peluqueria/NuevaOrdenModal'
import { useAuth } from '../../context/useAuth'

interface PeluqueriaTabPacienteProps {
  pacienteId: string
  paciente: any
}

export function PeluqueriaTabPaciente({ pacienteId, paciente }: PeluqueriaTabPacienteProps) {
  const { sucursalActivaId } = useAuth()
  const [ficha, setFicha] = useState<PeluqueriaFicha | null>(null)
  const [ordenes, setOrdenes] = useState<PeluqueriaOrdenConDetalle[]>([])
  const [fotos, setFotos] = useState<PeluqueriaFoto[]>([])

  const [modalFicha, setModalFicha] = useState(false)
  const [modalNuevaOrden, setModalNuevaOrden] = useState(false)
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<PeluqueriaOrdenConDetalle | null>(null)

  const recargar = useCallback(async () => {
    try {
      const [f, ords, fts] = await Promise.all([
        getFichaGrooming(pacienteId),
        listOrdenes({ pacienteId }),
        listFotosDePaciente(pacienteId),
      ])
      setFicha(f)
      setOrdenes(ords)
      setFotos(fts)
    } finally {
      // Done
    }
  }, [pacienteId])

  useEffect(() => {
    recargar()
  }, [recargar])

  return (
    <div className="space-y-6">
      {/* Tarjeta de Preferencias de Grooming */}
      <Card className="p-5 border-slate-200 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-800 font-bold">
              <Scissors size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Ficha Estética y Preferencias</h3>
              <p className="text-xs text-slate-500">Estilo de corte, cosméticos y comportamiento en mesa</p>
            </div>
          </div>

          <Button type="button" variant="outline" size="sm" onClick={() => setModalFicha(true)}>
            <Sparkles size={14} className="mr-1 text-teal-600" />
            <span>{ficha ? 'Editar Ficha' : 'Configurar Ficha'}</span>
          </Button>
        </div>

        {ficha ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 space-y-0.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Corte Habitual</p>
              <p className="font-bold text-slate-800 text-sm">{ficha.corte_habitual || 'No especificado'}</p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 space-y-0.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Longitud Preferida</p>
              <p className="font-semibold text-slate-800">{ficha.longitud_preferida || 'No especificada'}</p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 space-y-0.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Frecuencia Habitual</p>
              <p className="font-semibold text-slate-800">Cada {ficha.frecuencia_dias || 30} días</p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 space-y-0.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Comportamiento en Mesa</p>
              <p className="font-bold text-slate-800">{COMPORTAMIENTO_LABEL[ficha.comportamiento]}</p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 space-y-0.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cosmética Preferida</p>
              <p className="text-slate-700">{ficha.productos_preferidos || 'Estándar de la clínica'}</p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 space-y-0.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sensibilidad Cutánea</p>
              <p className="text-slate-700">{ficha.alergias_sensibilidad || 'Ninguna observada'}</p>
            </div>

            {ficha.observaciones && (
              <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Observaciones</p>
                <p className="text-slate-700">{ficha.observaciones}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-center py-6 text-xs text-slate-400 italic">
            Sin ficha estética configurada aún. Haz clic en "Configurar Ficha" para registrar preferencias.
          </p>
        )}
      </Card>

      {/* Galería de Fotografías Históricas de Peluquería */}
      <Card className="p-5 border-slate-200 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-teal-700" />
            <h3 className="font-bold text-sm text-slate-900">Fotos de Sesiones ({fotos.length})</h3>
          </div>
        </div>

        {fotos.length === 0 ? (
          <p className="text-center py-6 text-xs text-slate-400">No hay fotos guardadas de sesiones de peluquería.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {fotos.map((f) => (
              <div key={f.id} className="group relative rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                <img src={f.foto_url} alt={f.tipo} className="h-32 w-full object-cover group-hover:scale-105 transition-transform" />
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-white text-[10px] flex justify-between items-center">
                  <span className="capitalize font-bold">{f.tipo}</span>
                  <span className="text-slate-300">{formatClinicDate(f.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Historial de Órdenes de Peluquería */}
      <Card className="p-0 overflow-hidden border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-slate-50/60">
          <div>
            <h3 className="font-bold text-sm text-slate-900">Historial de Órdenes de Servicio ({ordenes.length})</h3>
            <p className="text-xs text-slate-500">Registro histórico de baños, cortes y tratamientos</p>
          </div>

          <Button type="button" variant="primary" size="sm" onClick={() => setModalNuevaOrden(true)}>
            <Plus size={14} className="mr-1" />
            <span>Nueva Orden</span>
          </Button>
        </div>

        <div className="divide-y divide-slate-100">
          {ordenes.length === 0 ? (
            <p className="text-center py-8 text-xs text-slate-400">Sin órdenes de peluquería registradas.</p>
          ) : (
            ordenes.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between p-4 text-xs hover:bg-slate-50 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">#{o.numero_orden}</span>
                    <span className="font-semibold text-slate-800">{o.servicio?.nombre || 'Grooming'}</span>
                    <Badge tone={ESTADO_ORDEN_TONE[o.estado]}>
                      {ESTADO_ORDEN_LABEL[o.estado]}
                    </Badge>
                  </div>
                  <p className="text-slate-500 mt-0.5">
                    Fecha: {formatClinicDateTime(o.hora_ingreso)} · Peluquero: <span className="font-medium text-slate-700">{o.peluquero?.nombre}</span>
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-bold text-teal-800 text-sm">{formatBs(o.precio_final_bs)}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOrdenSeleccionada(o)}
                  >
                    Detalle
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Modales */}
      {modalFicha && (
        <FichaGroomingModal
          paciente={paciente}
          onClose={() => setModalFicha(false)}
          onSaved={() => recargar()}
        />
      )}

      {modalNuevaOrden && (
        <NuevaOrdenModal
          sucursalId={sucursalActivaId || ''}
          pacientePreseleccionadoId={pacienteId}
          onClose={() => setModalNuevaOrden(false)}
          onCreated={() => recargar()}
        />
      )}

      {ordenSeleccionada && (
        <OrdenDetalleModal
          orden={ordenSeleccionada}
          onClose={() => setOrdenSeleccionada(null)}
          onUpdated={() => {
            recargar()
            setOrdenSeleccionada(null)
          }}
        />
      )}
    </div>
  )
}
