import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import {
  Calendar,
  RefreshCw,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { formatBs } from '../../lib/currency'
import { getReportePeluqueria, type ReporteOperativoPeluqueria } from '../../services/reportesPeluqueria'

export function PeluqueriaReportesPage() {
  const { sucursalActivaId } = useAuth()
  const hoyStr = new Date().toISOString().slice(0, 10)
  const primerDiaMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10)

  const [desde, setDesde] = useState(primerDiaMes)
  const [hasta, setHasta] = useState(hoyStr)
  const [reporte, setReporte] = useState<ReporteOperativoPeluqueria | null>(null)
  const [cargando, setCargando] = useState(true)

  async function recargar() {
    setCargando(true)
    try {
      const res = await getReportePeluqueria(sucursalActivaId || undefined, desde, hasta)
      setReporte(res)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    recargar()
  }, [sucursalActivaId, desde, hasta])

  return (
    <div className="space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Reportes y Rentabilidad de Peluquería
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Análisis financiero, volumen operativo, comisiones, consumo de insumos y margen neto estimado.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={recargar} disabled={cargando}>
            <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* Selector de Rango de Fechas */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-slate-400" />
          <span className="text-xs font-bold text-slate-700">Rango de fechas:</span>
        </div>

        <div className="w-36">
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="text-xs" />
        </div>
        <span className="text-xs text-slate-400">hasta</span>
        <div className="w-36">
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="text-xs" />
        </div>
      </div>

      {/* Métricas Financieras y de Rentabilidad */}
      {reporte && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Card className="p-4 border-slate-200 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ingresos Totales</p>
            <p className="text-2xl font-black text-slate-900">{formatBs(reporte.totalIngresosBs)}</p>
            <p className="text-[11px] text-slate-500">{reporte.completados} servicios completados</p>
          </Card>

          <Card className="p-4 border-slate-200 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ticket Promedio</p>
            <p className="text-2xl font-black text-slate-800">{formatBs(reporte.ticketPromedioBs)}</p>
            <p className="text-[11px] text-slate-500">Por servicio atendido</p>
          </Card>

          <Card className="p-4 border-slate-200 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Comisiones Personal</p>
            <p className="text-2xl font-black text-amber-900">{formatBs(reporte.totalComisionesBs)}</p>
            <p className="text-[11px] text-amber-700">Ganancia de estilistas</p>
          </Card>

          <Card className="p-4 border-slate-200 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Costo de Insumos</p>
            <p className="text-2xl font-black text-slate-800">{formatBs(reporte.totalCostoInsumosBs)}</p>
            <p className="text-[11px] text-slate-500">Kardex / Shampoos / Dosis</p>
          </Card>

          <Card className="p-4 border-teal-200 bg-teal-50/50 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Margen Neto Estimado</p>
            <p className="text-2xl font-black text-teal-900">{formatBs(reporte.margenEstimadoBs)}</p>
            <p className="text-[11px] text-teal-800">Ingresos - Comisiones - Insumos</p>
          </Card>
        </div>
      )}

      {/* Rendimiento por Peluquero y Servicios Más Vendidos */}
      {reporte && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Por Peluquero */}
          <Card className="p-0 overflow-hidden border-slate-200">
            <div className="border-b border-slate-200 px-5 py-4 bg-slate-50/60">
              <h3 className="font-bold text-sm text-slate-800">Rendimiento por Peluquero</h3>
            </div>

            <div className="divide-y divide-slate-100">
              {reporte.porPeluquero.length === 0 ? (
                <p className="text-center py-8 text-xs text-slate-400">Sin datos</p>
              ) : (
                reporte.porPeluquero.map((p) => (
                  <div key={p.peluqueroId} className="flex items-center justify-between p-4 text-xs">
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{p.nombre}</p>
                      <p className="text-slate-500">{p.servicios} servicios realizados</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-900">{formatBs(p.ingresosBs)}</p>
                      <p className="text-[11px] text-amber-700 font-bold">Comisión: {formatBs(p.comisionesBs)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Servicios Más Vendidos */}
          <Card className="p-0 overflow-hidden border-slate-200">
            <div className="border-b border-slate-200 px-5 py-4 bg-slate-50/60">
              <h3 className="font-bold text-sm text-slate-800">Servicios Más Vendidos</h3>
            </div>

            <div className="divide-y divide-slate-100">
              {reporte.porServicio.length === 0 ? (
                <p className="text-center py-8 text-xs text-slate-400">Sin datos</p>
              ) : (
                reporte.porServicio.map((s) => (
                  <div key={s.servicioId} className="flex items-center justify-between p-4 text-xs">
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{s.nombre}</p>
                      <p className="text-slate-500 capitalize">{s.categoria} · {s.cantidad} veces</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-teal-800">{formatBs(s.ingresosBs)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
