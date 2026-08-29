import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Select } from '../../components/ui/Field'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTable } from '../../mocks/useDb'
import { formatBs } from '../../lib/currency'
import { formatClinicDate, formatClinicTime } from '../../lib/datetime'
import { listOrdenes, ESTADO_ORDEN_LABEL, ESTADO_ORDEN_TONE } from '../../services/peluqueria'
import { puedeHacerPeluqueria } from '../../lib/personal'
import type { PeluqueriaOrdenConDetalle } from '../../types/views'
import { NuevaOrdenModal } from '../../features/peluqueria/NuevaOrdenModal'
import { OrdenDetalleModal } from '../../features/peluqueria/OrdenDetalleModal'
import { format, addDays, startOfWeek, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'

export function PeluqueriaAgendaPage() {
  const { sucursalActivaId } = useAuth()
  const usuarios = useTable('usuarios')
  const peluqueros = usuarios.filter(puedeHacerPeluqueria)

  const [vista, setVista] = useState<'dia' | 'semana' | 'mes'>('dia')
  const [fechaActual, setFechaActual] = useState(new Date())
  const [peluqueroFiltro, setPeluqueroFiltro] = useState('')

  const [ordenes, setOrdenes] = useState<PeluqueriaOrdenConDetalle[]>([])

  const [modalNueva, setModalNueva] = useState(false)
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<PeluqueriaOrdenConDetalle | null>(null)

  async function recargar() {
    try {
      const ords = await listOrdenes({
        sucursalId: sucursalActivaId || undefined,
        peluqueroId: peluqueroFiltro || undefined,
      })
      setOrdenes(ords)
    } finally {
      // Done
    }
  }

  useEffect(() => {
    recargar()
  }, [sucursalActivaId, peluqueroFiltro])

  function avanzar() {
    if (vista === 'dia') setFechaActual(addDays(fechaActual, 1))
    else if (vista === 'semana') setFechaActual(addDays(fechaActual, 7))
    else setFechaActual(addDays(fechaActual, 30))
  }

  function retroceder() {
    if (vista === 'dia') setFechaActual(addDays(fechaActual, -1))
    else if (vista === 'semana') setFechaActual(addDays(fechaActual, -7))
    else setFechaActual(addDays(fechaActual, -30))
  }

  // Filtrar órdenes según la vista
  const diasSemana = Array.from({ length: 7 }, (_, i) => {
    const inicio = startOfWeek(fechaActual, { weekStartsOn: 1 })
    return addDays(inicio, i)
  })

  return (
    <div className="space-y-6">
      {/* Cabecera y Selector de Fecha */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Agenda de Peluquería y Spa
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Planificación de turnos, bloqueos de duración y prevención de solapamientos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="primary" onClick={() => setModalNueva(true)}>
            <Plus size={16} className="mr-1.5" />
            <span>Agendar Servicio</span>
          </Button>
        </div>
      </div>

      {/* Controles de Navegación y Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={retroceder}
              className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => setFechaActual(new Date())}
              className="px-3 py-1 text-xs font-bold text-slate-700 hover:bg-white rounded-lg transition-colors"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={avanzar}
              className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <span className="text-sm font-bold text-slate-800 capitalize">
            {format(fechaActual, "MMMM 'de' yyyy", { locale: es })}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-48">
            <Select
              value={peluqueroFiltro}
              onChange={(e) => setPeluqueroFiltro(e.target.value)}
              className="text-xs"
            >
              <option value="">Todos los peluqueros</option>
              {peluqueros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setVista('dia')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                vista === 'dia' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
              }`}
            >
              Día
            </button>
            <button
              type="button"
              onClick={() => setVista('semana')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                vista === 'semana' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
              }`}
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => setVista('mes')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                vista === 'mes' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
              }`}
            >
              Mes
            </button>
          </div>
        </div>
      </div>

      {/* Vista Día */}
      {vista === 'dia' && (
        <Card className="p-4 border-slate-200">
          <h2 className="text-sm font-bold text-slate-800 mb-4 capitalize">
            {format(fechaActual, "EEEE d 'de' MMMM", { locale: es })}
          </h2>

          {(() => {
            const ordenesDia = ordenes.filter((o) =>
              isSameDay(new Date(o.hora_ingreso || o.created_at), fechaActual),
            )

            if (ordenesDia.length === 0) {
              return (
                <div className="text-center py-16 text-slate-400">
                  <CalendarDays size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium text-slate-600">No hay citas ni servicios para este día</p>
                </div>
              )
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {ordenesDia.map((o) => (
                  <div
                    key={o.id}
                    onClick={() => setOrdenSeleccionada(o)}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-teal-400 hover:shadow-md transition-all cursor-pointer space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-400">#{o.numero_orden}</span>
                      <Badge tone={ESTADO_ORDEN_TONE[o.estado]}>
                        {ESTADO_ORDEN_LABEL[o.estado]}
                      </Badge>
                    </div>

                    <div>
                      <h3 className="font-bold text-base text-slate-900">{o.paciente?.nombre}</h3>
                      <p className="text-xs text-slate-500">
                        {o.paciente?.especie} · {o.paciente?.raza || 'Mestizo'}
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs text-slate-600 space-y-1">
                      <p>
                        <span className="font-bold text-slate-400 text-[10px] uppercase">Servicio:</span>{' '}
                        <span className="font-semibold text-slate-800">{o.servicio?.nombre || 'Grooming'}</span>
                      </p>
                      <p>
                        <span className="font-bold text-slate-400 text-[10px] uppercase">Peluquero:</span>{' '}
                        <span className="font-semibold text-slate-800">{o.peluquero?.nombre}</span>
                      </p>
                      <p>
                        <span className="font-bold text-slate-400 text-[10px] uppercase">Tutor:</span>{' '}
                        <span>{o.cliente?.nombre}</span> ({o.cliente?.whatsapp || '—'})
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-xs">
                      <span className="font-semibold text-slate-500">
                        <Clock size={12} className="inline mr-1 text-slate-400" />
                        {formatClinicTime(o.hora_ingreso)}
                      </span>
                      <span className="font-black text-teal-800 text-sm">{formatBs(o.precio_final_bs)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </Card>
      )}

      {/* Vista Semana */}
      {vista === 'semana' && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          {diasSemana.map((dia, idx) => {
            const ordsDelDia = ordenes.filter((o) =>
              isSameDay(new Date(o.hora_ingreso || o.created_at), dia),
            )
            const esHoy = isSameDay(dia, new Date())

            return (
              <div
                key={idx}
                className={`rounded-2xl border p-3 flex flex-col min-h-[300px] ${
                  esHoy ? 'border-teal-300 bg-teal-50/30' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="border-b border-slate-100 pb-2 mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {format(dia, 'EEEE', { locale: es })}
                  </p>
                  <p className="text-sm font-black text-slate-800">{format(dia, 'd MMM')}</p>
                </div>

                <div className="space-y-2 flex-1 overflow-y-auto">
                  {ordsDelDia.map((o) => (
                    <div
                      key={o.id}
                      onClick={() => setOrdenSeleccionada(o)}
                      className="rounded-xl border border-slate-100 bg-slate-50 p-2 text-xs hover:bg-teal-50 hover:border-teal-300 transition-colors cursor-pointer space-y-1"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-800 truncate">{o.paciente?.nombre}</span>
                        <span className="text-[9px] font-bold text-teal-700">{formatClinicTime(o.hora_ingreso)}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 truncate">{o.servicio?.nombre || 'Grooming'}</p>
                      <Badge tone={ESTADO_ORDEN_TONE[o.estado]}>
                        {ESTADO_ORDEN_LABEL[o.estado]}
                      </Badge>
                    </div>
                  ))}
                  {ordsDelDia.length === 0 && (
                    <p className="text-center py-6 text-[11px] text-slate-300">Libre</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Vista Mes */}
      {vista === 'mes' && (
        <Card className="p-4 border-slate-200">
          <div className="divide-y divide-slate-100">
            {ordenes.map((o) => (
              <div
                key={o.id}
                onClick={() => setOrdenSeleccionada(o)}
                className="flex items-center justify-between p-3 text-xs hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-20 text-slate-500 font-semibold">
                    {formatClinicDate(o.hora_ingreso || o.created_at)}
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 text-sm">{o.paciente?.nombre}</span>{' '}
                    <span className="text-slate-400">· {o.servicio?.nombre || 'Grooming'}</span>
                    <p className="text-[11px] text-slate-500">Peluquero: {o.peluquero?.nombre} · Dueño: {o.cliente?.nombre}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge tone={ESTADO_ORDEN_TONE[o.estado]}>
                    {ESTADO_ORDEN_LABEL[o.estado]}
                  </Badge>
                  <span className="font-black text-teal-800 text-sm">{formatBs(o.precio_final_bs)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

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
        />
      )}
    </div>
  )
}
