import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Input, Select } from '../../components/ui/Field'
import {
  Plus,
  Search,
  LayoutGrid,
  List,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTable } from '../../mocks/useDb'
import { formatBs } from '../../lib/currency'
import { formatClinicTime } from '../../lib/datetime'
import {
  listOrdenes,
  ESTADO_ORDEN_LABEL,
  ESTADO_ORDEN_TONE,
  avanzarEstadoOrden,
} from '../../services/peluqueria'
import { puedeHacerPeluqueria } from '../../lib/personal'
import type { PeluqueriaOrdenConDetalle } from '../../types/views'
import type { EstadoOrdenPeluqueria } from '../../types/database'
import { NuevaOrdenModal } from '../../features/peluqueria/NuevaOrdenModal'
import { OrdenDetalleModal } from '../../features/peluqueria/OrdenDetalleModal'
import { EvaluacionInicialModal } from '../../features/peluqueria/EvaluacionInicialModal'

const COLUMNAS_KANBAN: { estado: EstadoOrdenPeluqueria; titulo: string }[] = [
  { estado: 'recepcion', titulo: 'Recepción' },
  { estado: 'evaluacion', titulo: 'Evaluación' },
  { estado: 'en_espera', titulo: 'En Espera' },
  { estado: 'en_proceso', titulo: 'En Proceso' },
  { estado: 'terminada', titulo: 'Terminadas' },
  { estado: 'lista_recoger', titulo: 'Lista p/ Recoger' },
  { estado: 'entregada', titulo: 'Entregadas' },
]

export function PeluqueriaOrdenesPage() {
  const { sucursalActivaId, usuario } = useAuth()
  const usuarios = useTable('usuarios')
  const peluqueros = usuarios.filter(puedeHacerPeluqueria)

  const [modoVista, setModoVista] = useState<'kanban' | 'tabla'>('kanban')
  const [busqueda, setBusqueda] = useState('')
  const [peluqueroId, setPeluqueroId] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('')

  const [ordenes, setOrdenes] = useState<PeluqueriaOrdenConDetalle[]>([])

  const [modalNueva, setModalNueva] = useState(false)
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<PeluqueriaOrdenConDetalle | null>(null)
  const [ordenEvaluando, setOrdenEvaluando] = useState<PeluqueriaOrdenConDetalle | null>(null)

  async function recargar() {
    try {
      const res = await listOrdenes({
        sucursalId: sucursalActivaId || undefined,
        peluqueroId: peluqueroId || undefined,
        estado: (estadoFiltro as any) || undefined,
        busqueda: busqueda || undefined,
      })
      setOrdenes(res)
    } finally {
      // Cargado
    }
  }

  useEffect(() => {
    recargar()
  }, [sucursalActivaId, peluqueroId, estadoFiltro, busqueda])

  async function handleMoverEstado(ordenId: string, nuevoEstado: EstadoOrdenPeluqueria) {
    try {
      await avanzarEstadoOrden(ordenId, nuevoEstado, { usuarioId: usuario?.id })
      recargar()
    } catch (err: any) {
      alert(err.message || 'Error al mover orden')
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Órdenes de Servicio de Peluquería
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Seguimiento visual del flujo de atención desde la recepción hasta la entrega y cobro.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="primary" onClick={() => setModalNueva(true)}>
            <Plus size={16} className="mr-1.5" />
            <span>Nueva Orden</span>
          </Button>
        </div>
      </div>

      {/* Filtros y Selector de Vista */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
            <Input
              placeholder="Buscar por mascota, dueño, CI o teléfono..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>

          <div className="w-44">
            <Select value={peluqueroId} onChange={(e) => setPeluqueroId(e.target.value)} className="text-xs">
              <option value="">Todos los peluqueros</option>
              {peluqueros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </div>

          <div className="w-40">
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

        {/* Toggle Vista Kanban vs Tabla */}
        <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setModoVista('kanban')}
            className={`p-1.5 rounded-lg transition-colors ${
              modoVista === 'kanban' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
            }`}
            title="Vista Kanban"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            onClick={() => setModoVista('tabla')}
            className={`p-1.5 rounded-lg transition-colors ${
              modoVista === 'tabla' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
            }`}
            title="Vista Lista / Tabla"
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {/* Vista Kanban */}
      {modoVista === 'kanban' && (
        <div className="flex gap-3 overflow-x-auto pb-4 items-start min-h-[500px]">
          {COLUMNAS_KANBAN.map(({ estado, titulo }) => {
            const ordsColumna = ordenes.filter((o) => o.estado === estado)

            return (
              <div
                key={estado}
                className="w-72 shrink-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 flex flex-col max-h-[75vh]"
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200">
                  <span className="font-bold text-xs text-slate-800">{titulo}</span>
                  <Badge tone={ESTADO_ORDEN_TONE[estado]}>{ordsColumna.length}</Badge>
                </div>

                <div className="space-y-2 flex-1 overflow-y-auto pr-1">
                  {ordsColumna.map((o) => (
                    <div
                      key={o.id}
                      onClick={() => setOrdenSeleccionada(o)}
                      className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-teal-400 hover:shadow-md transition-all cursor-pointer space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-xs text-slate-400">#{o.numero_orden}</span>
                        {o.alerta_veterinaria && (
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                            Alerta
                          </span>
                        )}
                        <span className="font-bold text-teal-800 text-xs">{formatBs(o.precio_final_bs)}</span>
                      </div>

                      <div>
                        <h4 className="font-bold text-sm text-slate-900">{o.paciente?.nombre}</h4>
                        <p className="text-[11px] text-slate-500">
                          {o.servicio?.nombre || 'Grooming'} · {o.peluquero?.nombre}
                        </p>
                        <p className="text-[11px] text-slate-600 font-medium">
                          Tutor: {o.cliente?.nombre}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-50 text-[10px] text-slate-400">
                        <span>{formatClinicTime(o.hora_ingreso)}</span>
                        {estado === 'recepcion' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setOrdenEvaluando(o)
                            }}
                            className="font-bold text-teal-700 hover:text-teal-900"
                          >
                            Evaluar →
                          </button>
                        )}
                        {estado === 'terminada' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleMoverEstado(o.id, 'lista_recoger')
                            }}
                            className="font-bold text-emerald-700 hover:text-emerald-900"
                          >
                            Avisar lista →
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {ordsColumna.length === 0 && (
                    <p className="text-center py-8 text-xs text-slate-300">Sin órdenes</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Vista Tabla */}
      {modoVista === 'tabla' && (
        <Card className="p-0 overflow-hidden border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3"># Orden</th>
                  <th className="px-4 py-3">Mascota / Especie</th>
                  <th className="px-4 py-3">Tutor / Dueño</th>
                  <th className="px-4 py-3">Servicio</th>
                  <th className="px-4 py-3">Peluquero</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Precio Final</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ordenes.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-900">#{o.numero_orden}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {o.paciente?.nombre} ({o.paciente?.especie})
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {o.cliente?.nombre} <span className="text-slate-400">({o.cliente?.whatsapp || '—'})</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{o.servicio?.nombre || 'Grooming'}</td>
                    <td className="px-4 py-3 text-slate-700">{o.peluquero?.nombre}</td>
                    <td className="px-4 py-3">
                      <Badge tone={ESTADO_ORDEN_TONE[o.estado]}>
                        {ESTADO_ORDEN_LABEL[o.estado]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-teal-800">{formatBs(o.precio_final_bs)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setOrdenSeleccionada(o)}
                      >
                        Detalle
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
