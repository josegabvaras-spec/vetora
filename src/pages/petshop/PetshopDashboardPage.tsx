import { useEffect, useState, useCallback } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Input } from '../../components/ui/Field'
import {
  DollarSign,
  TrendingUp,
  ShoppingCart,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { formatBs } from '../../lib/currency'
import { formatClinicDateTime } from '../../lib/datetime'
import { getResumenDashboardPetshop } from '../../services/reportesPetshop'
import { CATEGORIA_RETAIL_LABEL } from '../../services/petshop'
import type { ResumenDashboardPetshop } from '../../types/views'
import { Link } from 'react-router-dom'

export function PetshopDashboardPage() {
  const { sucursalActivaId } = useAuth()
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [resumen, setResumen] = useState<ResumenDashboardPetshop | null>(null)
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      const data = await getResumenDashboardPetshop(sucursalActivaId || undefined, fecha)
      setResumen(data)
    } finally {
      setCargando(false)
    }
  }, [sucursalActivaId, fecha])

  useEffect(() => {
    recargar()
  }, [recargar])

  const crecimientoVentas =
    resumen && resumen.ventas_ayer_bs > 0
      ? ((resumen.ventas_hoy_bs - resumen.ventas_ayer_bs) / resumen.ventas_ayer_bs) * 100
      : 0

  return (
    <div className="space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Dashboard de Pet Shop
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Rendimiento comercial en tiempo real, alertas de inventario y actividad de ventas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-40"
          />
          <Button type="button" variant="outline" size="sm" onClick={() => recargar()}>
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
          </Button>
          <Link to="/petshop/pos">
            <Button type="button" variant="primary" size="sm">
              <ShoppingCart size={15} className="mr-1.5" />
              <span>Abrir POS</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Tarjetas Métricas Clave */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Ventas del Día
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <DollarSign size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-teal-800">
            {formatBs(resumen?.ventas_hoy_bs || 0)}
          </p>
          <div className="flex items-center gap-1.5 text-xs">
            <Badge tone={crecimientoVentas >= 0 ? 'emerald' : 'rose'}>
              {crecimientoVentas >= 0 ? '+' : ''}
              {crecimientoVentas.toFixed(1)}%
            </Badge>
            <span className="text-slate-400 text-[11px]">vs. ayer ({formatBs(resumen?.ventas_ayer_bs || 0)})</span>
          </div>
        </Card>

        <Card className="p-4 border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Transacciones
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <ShoppingCart size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900">
            {resumen?.transacciones_hoy || 0}
          </p>
          <p className="text-[11px] text-slate-500">
            Ayer: <strong className="text-slate-700">{resumen?.transacciones_ayer || 0}</strong> tickets
          </p>
        </Card>

        <Card className="p-4 border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Ticket Promedio
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <TrendingUp size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900">
            {formatBs(resumen?.ticket_promedio_hoy_bs || 0)}
          </p>
          <p className="text-[11px] text-slate-500">
            {resumen?.productos_vendidos_hoy || 0} artículos vendidos hoy
          </p>
        </Card>

        <Card className="p-4 border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Alertas de Stock
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-700">
              {resumen?.productos_stock_bajo || 0}
            </span>
            <span className="text-xs text-slate-500">bajo mínimo</span>
          </div>
          <p className="text-[11px] text-slate-500">
            {resumen?.productos_por_vencer || 0} lotes por vencer o vencidos
          </p>
        </Card>
      </div>

      {/* Grid Central: Ventas por Categoría y Top Productos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ventas por Categoría */}
        <Card className="p-5 border-slate-200 space-y-4 lg:col-span-1">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-sm text-slate-900">Ventas por Categoría</h3>
            <span className="text-xs text-slate-400">Hoy</span>
          </div>

          {(resumen?.ventas_por_categoria || []).length === 0 ? (
            <p className="text-center py-8 text-xs text-slate-400">Sin ventas hoy</p>
          ) : (
            <div className="space-y-3">
              {(resumen?.ventas_por_categoria || []).map((cat) => {
                const totalHoy = resumen?.ventas_hoy_bs || 1
                const pct = (cat.total_bs / totalHoy) * 100
                return (
                  <div key={cat.categoria} className="space-y-1 text-xs">
                    <div className="flex justify-between font-semibold text-slate-700">
                      <span>{CATEGORIA_RETAIL_LABEL[cat.categoria] || cat.categoria}</span>
                      <span className="font-bold text-slate-900">{formatBs(cat.total_bs)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Top Productos Más Vendidos.
            `min-w-0` porque dentro hay una tabla con su propio
            `overflow-x-auto`: sin esto el grid item se niega a encogerse por
            debajo del ancho de la tabla (nace con `min-width: auto`), la tabla
            nunca llega a desplazarse sola y es la página entera la que se va de
            ancho. Mismo caso que la ficha del paciente. */}
        <Card className="min-w-0 p-5 border-slate-200 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-sm text-slate-900">Productos Más Vendidos Hoy</h3>
            <Link to="/petshop/productos" className="text-xs font-bold text-teal-700 hover:text-teal-900">
              Ver catálogo →
            </Link>
          </div>

          {(resumen?.productos_mas_vendidos || []).length === 0 ? (
            <p className="text-center py-8 text-xs text-slate-400">Sin registros de venta</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {(resumen?.productos_mas_vendidos || []).map((p, idx) => (
                <div key={idx} className="flex items-center justify-between py-2.5 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 font-black text-slate-600 text-[11px]">
                      #{idx + 1}
                    </span>
                    <div>
                      <p className="font-bold text-slate-900">{p.nombre}</p>
                      <p className="text-[11px] text-slate-500">{p.cantidad} unidades vendidas</p>
                    </div>
                  </div>
                  <span className="font-black text-teal-800 text-sm">{formatBs(p.total_bs)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Actividad Reciente de Ventas */}
      <Card className="p-5 border-slate-200 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-bold text-sm text-slate-900">Últimas Transacciones Realizadas</h3>
          <Link to="/petshop/ordenes" className="text-xs font-bold text-teal-700 hover:text-teal-900">
            Ver todas las ventas →
          </Link>
        </div>

        {(resumen?.ultimas_ventas || []).length === 0 ? (
          <p className="text-center py-8 text-xs text-slate-400">No hay ventas registradas en esta fecha</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-2.5">Recibo</th>
                  <th className="px-4 py-2.5">Cliente</th>
                  <th className="px-4 py-2.5">Artículos</th>
                  <th className="px-4 py-2.5">Método de Pago</th>
                  <th className="px-4 py-2.5">Hora</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(resumen?.ultimas_ventas || []).map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5 font-bold text-slate-900">#{v.numero_recibo}</td>
                    <td className="px-4 py-2.5 text-slate-700">{v.cliente_nombre}</td>
                    <td className="px-4 py-2.5 text-slate-500">{v.items_count} ítems</td>
                    <td className="px-4 py-2.5 capitalize font-medium text-slate-600">{v.metodo_pago}</td>
                    <td className="px-4 py-2.5 text-slate-400">{formatClinicDateTime(v.created_at)}</td>
                    <td className="px-4 py-2.5 text-right font-black text-teal-800">{formatBs(v.total_bs)}</td>
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
