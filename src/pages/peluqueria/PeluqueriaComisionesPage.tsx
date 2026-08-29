import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Select } from '../../components/ui/Field'
import { CheckCircle2, RefreshCw } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTable } from '../../mocks/useDb'
import { formatBs } from '../../lib/currency'
import { formatClinicDate } from '../../lib/datetime'
import { listComisiones } from '../../services/comisiones'
import { puedeHacerPeluqueria } from '../../lib/personal'
import type { PeluqueriaComisionConDetalle } from '../../types/views'
import { LiquidarComisionesModal } from '../../features/peluqueria/LiquidarComisionesModal'

export function PeluqueriaComisionesPage() {
  const { sucursalActivaId, usuario } = useAuth()
  const usuarios = useTable('usuarios')
  const peluqueros = usuarios.filter(puedeHacerPeluqueria)

  const [peluqueroId, setPeluqueroId] = useState(
    usuario?.rol === 'peluquero' ? usuario.id : '',
  )
  const [estadoFiltro, setEstadoFiltro] = useState<'pendiente' | 'liquidada' | ''>('')
  const [comisiones, setComisiones] = useState<PeluqueriaComisionConDetalle[]>([])
  const [cargando, setCargando] = useState(true)

  const [modalLiquidar, setModalLiquidar] = useState(false)

  async function recargar() {
    setCargando(true)
    try {
      const res = await listComisiones({
        sucursalId: sucursalActivaId || undefined,
        peluqueroId: peluqueroId || undefined,
        estado: (estadoFiltro as any) || undefined,
      })
      setComisiones(res)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    recargar()
  }, [sucursalActivaId, peluqueroId, estadoFiltro])

  const totalPendienteBs = comisiones
    .filter((c) => c.estado === 'pendiente')
    .reduce((acc, c) => acc + (Number(c.monto_comision_bs) || 0), 0)

  const totalLiquidadaBs = comisiones
    .filter((c) => c.estado === 'liquidada')
    .reduce((acc, c) => acc + (Number(c.monto_comision_bs) || 0), 0)

  return (
    <div className="space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Control y Liquidación de Comisiones
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Registro de ganancias por corte, baño y tratamientos de peluquería.
          </p>
        </div>

        {usuario?.rol === 'admin' && (
          <Button
            type="button"
            variant="primary"
            onClick={() => setModalLiquidar(true)}
            disabled={totalPendienteBs === 0}
          >
            <CheckCircle2 size={16} className="mr-1.5" />
            <span>Liquidar Comisiones Pendientes</span>
          </Button>
        )}
      </div>

      {/* Resumen de Comisiones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-4 border-amber-200 bg-amber-50/40 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Comisiones Pendientes de Pago</p>
          <p className="text-2xl font-black text-amber-900">{formatBs(totalPendienteBs)}</p>
          <p className="text-[11px] text-amber-800">
            {comisiones.filter((c) => c.estado === 'pendiente').length} servicios por liquidar
          </p>
        </Card>

        <Card className="p-4 border-emerald-200 bg-emerald-50/40 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Comisiones Liquidadas</p>
          <p className="text-2xl font-black text-emerald-900">{formatBs(totalLiquidadaBs)}</p>
          <p className="text-[11px] text-emerald-800">Historial pagado</p>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        {usuario?.rol === 'admin' && (
          <div className="w-52">
            <Select value={peluqueroId} onChange={(e) => setPeluqueroId(e.target.value)} className="text-xs">
              <option value="">Todos los peluqueros</option>
              {peluqueros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="w-44">
          <Select
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value as any)}
            className="text-xs"
          >
            <option value="">Todos los estados</option>
            <option value="pendiente">Solo Pendientes</option>
            <option value="liquidada">Solo Liquidadas</option>
          </Select>
        </div>

        <Button type="button" variant="outline" size="sm" onClick={recargar} disabled={cargando}>
          <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
        </Button>
      </div>

      {/* Tabla de Comisiones */}
      <Card className="p-0 overflow-hidden border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Peluquero</th>
                <th className="px-4 py-3">Orden / Mascota</th>
                <th className="px-4 py-3">Servicio</th>
                <th className="px-4 py-3 text-right">Monto Base</th>
                <th className="px-4 py-3 text-right">Comisión</th>
                <th className="px-4 py-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cargando ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    Cargando comisiones...
                  </td>
                </tr>
              ) : comisiones.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400 font-medium">
                    No hay comisiones registradas con estos filtros
                  </td>
                </tr>
              ) : (
                comisiones.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-500">{formatClinicDate(c.created_at)}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{c.peluquero?.nombre}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-800">#{c.orden?.numero_orden}</span> ·{' '}
                      <span className="text-slate-600">{c.orden?.paciente?.nombre}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.orden?.servicio?.nombre || 'Grooming'}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-600">
                      {formatBs(c.monto_base_bs)}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-teal-800 text-sm">
                      {formatBs(c.monto_comision_bs)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge tone={c.estado === 'liquidada' ? 'emerald' : 'amber'}>
                        {c.estado === 'liquidada' ? 'Liquidada' : 'Pendiente'}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal Liquidar */}
      {modalLiquidar && (
        <LiquidarComisionesModal
          comisiones={comisiones}
          onClose={() => setModalLiquidar(false)}
          onLiquidated={() => recargar()}
        />
      )}
    </div>
  )
}
