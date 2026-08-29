import { useEffect, useState, useCallback } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Select, Input } from '../../components/ui/Field'
import {
  Scissors,
  Plus,
  ArrowRight,
  Filter,
  RefreshCw,
} from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { useTable } from '../../mocks/useDb'
import { formatBs } from '../../lib/currency'
import { formatClinicDate, formatClinicTime } from '../../lib/datetime'
import {
  getResumenDashboard,
  listOrdenes,
  ESTADO_ORDEN_LABEL,
  ESTADO_ORDEN_TONE,
} from '../../services/peluqueria'
import type { PeluqueriaOrdenConDetalle, ResumenDashboardPeluqueria } from '../../types/views'
import { NuevaOrdenModal } from '../../features/peluqueria/NuevaOrdenModal'
import { OrdenDetalleModal } from '../../features/peluqueria/OrdenDetalleModal'
import { EvaluacionInicialModal } from '../../features/peluqueria/EvaluacionInicialModal'
import { puedeHacerPeluqueria } from '../../lib/personal'

export function PeluqueriaDashboardPage() {
  const { sucursalActivaId } = useAuth()
  const usuarios = useTable('usuarios')
  const peluqueros = usuarios.filter(puedeHacerPeluqueria)

  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [peluqueroId, setPeluqueroId] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('')

  const [resumen, setResumen] = useState<ResumenDashboardPeluqueria | null>(null)
  const [ordenes, setOrdenes] = useState<PeluqueriaOrdenConDetalle[]>([])
  const [cargando, setCargando] = useState(true)

  const [modalNueva, setModalNueva] = useState(false)
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<PeluqueriaOrdenConDetalle | null>(null)
  const [ordenEvaluando, setOrdenEvaluando] = useState<PeluqueriaOrdenConDetalle | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      const [res, ords] = await Promise.all([
        getResumenDashboard(sucursalActivaId || undefined, fecha),
        listOrdenes({
          sucursalId: sucursalActivaId || undefined,
          fecha,
          peluqueroId: peluqueroId || undefined,
          estado: (estadoFiltro as any) || undefined,
        }),
      ])
      setResumen(res)
      setOrdenes(ords)
    } finally {
      setCargando(false)
    }
  }, [sucursalActivaId, fecha, peluqueroId, estadoFiltro])

  useEffect(() => {
    recargar()
  }, [recargar])

  return (
    <div className="space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Peluquería y Estética Canina/Felina
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Control operativo de citas, recepciones, corte, baño y comisiones del día.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={recargar} disabled={cargando}>
            <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />
          </Button>
          <Button type="button" variant="primary" onClick={() => setModalNueva(true)}>
            <Plus size={16} className="mr-1.5" />
            <span>Nueva Orden de Peluquería</span>
          </Button>
        </div>
      </div>

      {/* Barra de Filtros Operativos */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
          <Filter size={15} />
          <span>Filtros:</span>
        </div>

        <div className="w-40">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="text-xs" />
        </div>

        <div className="w-48">
          <Select value={peluqueroId} onChange={(e) => setPeluqueroId(e.target.value)} className="text-xs">
            <option value="">Todos los peluqueros</option>
            {peluqueros.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-44">
          <Select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} className="text-xs">
            <option value="">Todos los estados</option>
            {Object.entries(ESTADO_ORDEN_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Métricas Principales */}
      {resumen && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="p-3.5 space-y-1 border-slate-200">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Citas de Hoy</p>
            <p className="text-2xl font-black text-slate-900">{resumen.citas_hoy}</p>
            <p className="text-[11px] text-slate-500">Total registradas</p>
          </Card>

          <Card className="p-3.5 space-y-1 border-slate-200">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">En Espera / Pend.</p>
            <p className="text-2xl font-black text-amber-800">{resumen.servicios_pendientes}</p>
            <p className="text-[11px] text-amber-700">Por iniciar</p>
          </Card>

          <Card className="p-3.5 space-y-1 border-slate-200">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">En Proceso</p>
            <p className="text-2xl font-black text-blue-800">{resumen.servicios_en_proceso}</p>
            <p className="text-[11px] text-blue-700">En mesa de corte</p>
          </Card>

          <Card className="p-3.5 space-y-1 border-slate-200">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Listas para Recoger</p>
            <p className="text-2xl font-black text-emerald-800">{resumen.mascotas_listas}</p>
            <p className="text-[11px] text-emerald-700">Avisadas al dueño</p>
          </Card>

          <Card className="p-3.5 space-y-1 border-slate-200">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Entregadas</p>
            <p className="text-2xl font-black text-slate-800">{resumen.mascotas_entregadas}</p>
            <p className="text-[11px] text-slate-500">Finalizadas</p>
          </Card>

          <Card className="p-3.5 space-y-1 border-teal-200 bg-teal-50/40">
            <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Ingresos del Día</p>
            <p className="text-2xl font-black text-teal-900">{formatBs(resumen.ingresos_hoy_bs)}</p>
            <p className="text-[11px] text-teal-800">Comisiones: {formatBs(resumen.comisiones_hoy_bs)}</p>
          </Card>
        </div>
      )}

      {/* Lista Operativa de Órdenes del Día */}
      <Card className="p-0 overflow-hidden border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-slate-50/60">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              Órdenes y Citas del Día ({ordenes.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Estado en tiempo real de los servicios programados para {formatClinicDate(fecha)}.
            </p>
          </div>
        </div>

        {cargando ? (
          <p className="text-center py-12 text-xs text-slate-500">Cargando órdenes...</p>
        ) : ordenes.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Scissors size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-700">No hay servicios registrados en esta fecha</p>
            <p className="text-xs text-slate-400 mt-1">Crea una nueva orden para comenzar la jornada de grooming.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 overflow-x-auto">
            {ordenes.map((orden) => (
              <div
                key={orden.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-slate-50/70 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-800 font-black text-sm">
                    #{orden.numero_orden}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{orden.paciente?.nombre}</span>
                      <Badge tone={ESTADO_ORDEN_TONE[orden.estado]}>
                        {ESTADO_ORDEN_LABEL[orden.estado]}
                      </Badge>
                      {orden.alerta_veterinaria && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          Alerta Médica
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {orden.servicio?.nombre || 'Grooming'} · Peluquero: <span className="font-semibold text-slate-700">{orden.peluquero?.nombre}</span> · Dueño: <span className="text-slate-700">{orden.cliente?.nombre}</span> ({orden.cliente?.whatsapp || 'Sin WhatsApp'})
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-black text-teal-800">{formatBs(orden.precio_final_bs)}</p>
                    <p className="text-[11px] text-slate-400">{formatClinicTime(orden.hora_ingreso)}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {orden.estado === 'recepcion' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setOrdenEvaluando(orden)}
                      >
                        Evaluar
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setOrdenSeleccionada(orden)}
                    >
                      <span>Ver Detalle</span>
                      <ArrowRight size={14} className="ml-1" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modales */}
      {modalNueva && (
        <NuevaOrdenModal
          sucursalId={sucursalActivaId || ''}
          onClose={() => setModalNueva(false)}
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
          onAbrirEvaluacion={() => {
            const ord = ordenSeleccionada
            setOrdenSeleccionada(null)
            setOrdenEvaluando(ord)
          }}
        />
      )}

      {ordenEvaluando && (
        <EvaluacionInicialModal
          orden={ordenEvaluando}
          onClose={() => setOrdenEvaluando(null)}
          onSaved={() => recargar()}
        />
      )}
    </div>
  )
}
