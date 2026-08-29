import { useEffect, useState, useCallback } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Input } from '../../components/ui/Field'
import {
  BarChart3,
  DollarSign,
  TrendingUp,
  RefreshCw,
  ArrowUpRight,
  Package,
} from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { formatBs } from '../../lib/currency'
import { getReporteRentabilidad } from '../../services/reportesPetshop'
import { CATEGORIA_RETAIL_LABEL } from '../../services/petshop'
import type { ReporteRentabilidadPetshop } from '../../types/views'

export function PetshopReportesPage() {
  const { sucursalActivaId } = useAuth()
  const [fechaDesde, setFechaDesde] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
  )
  const [fechaHasta, setFechaHasta] = useState(new Date().toISOString().slice(0, 10))

  const [reporte, setReporte] = useState<ReporteRentabilidadPetshop | null>(null)
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      const data = await getReporteRentabilidad(
        sucursalActivaId || undefined,
        fechaDesde,
        fechaHasta,
      )
      setReporte(data)
    } finally {
      setCargando(false)
    }
  }, [sucursalActivaId, fechaDesde, fechaHasta])

  useEffect(() => {
    recargar()
  }, [recargar])

  return (
    <div className="space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            <BarChart3 className="text-teal-700" size={24} />
            <span>Reportes Financieros y Rentabilidad</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Análisis de ingresos brutos, costos de mercadería vendida (COGS) y margen de utilidad.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-400 font-medium">Desde:</span>
            <Input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="w-36"
            />
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-400 font-medium">Hasta:</span>
            <Input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="w-36"
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => recargar()}>
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* Tarjetas de Rentabilidad Global */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Ventas Totales
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <DollarSign size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-teal-800">
            {formatBs(reporte?.total_ventas_bs || 0)}
          </p>
          <p className="text-[11px] text-slate-400">
            {reporte?.total_transacciones || 0} operaciones registradas
          </p>
        </Card>

        <Card className="p-4 border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Costo de Mercadería
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <Package size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800">
            {formatBs(reporte?.total_costo_bs || 0)}
          </p>
          <p className="text-[11px] text-slate-400">Costo unitario de compra acumulado</p>
        </Card>

        <Card className="p-4 border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Margen Bruto
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <TrendingUp size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-800">
            {formatBs(reporte?.margen_bruto_bs || 0)}
          </p>
          <p className="text-[11px] text-emerald-600 font-bold">
            Ganancia bruta (Ventas - Costos)
          </p>
        </Card>

        <Card className="p-4 border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Rentabilidad Media
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <ArrowUpRight size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-indigo-800">
            {(reporte?.margen_bruto_pct || 0).toFixed(1)}%
          </p>
          <p className="text-[11px] text-slate-400">Sobre total facturado</p>
        </Card>
      </div>

      {/* Desglose por Categoría */}
      <Card className="p-5 border-slate-200 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-bold text-sm text-slate-900">
            Rentabilidad y Ventas por Categoría Retail
          </h3>
          <Badge tone="slate">Período Seleccionado</Badge>
        </div>

        {(reporte?.desglose_por_categoria || []).length === 0 ? (
          <p className="text-center py-8 text-xs text-slate-400">
            No hay registros de venta en el período seleccionado
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Categoría Retail</th>
                  <th className="px-4 py-3 text-center">Unidades</th>
                  <th className="px-4 py-3 text-right">Venta Total</th>
                  <th className="px-4 py-3 text-right">Costo Total</th>
                  <th className="px-4 py-3 text-right">Margen Bruto (Bs.)</th>
                  <th className="px-4 py-3 text-right">Margen (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(reporte?.desglose_por_categoria || []).map((d) => (
                  <tr key={d.categoria} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {CATEGORIA_RETAIL_LABEL[d.categoria] || d.categoria}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-700 font-semibold">
                      {d.unidades}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-slate-900">
                      {formatBs(d.ventas_bs)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 font-medium">
                      {formatBs(d.costo_bs)}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-emerald-800">
                      {formatBs(d.margen_bs)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge tone={d.margen_pct >= 30 ? 'emerald' : 'amber'}>
                        {d.margen_pct.toFixed(1)}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
