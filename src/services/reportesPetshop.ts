import { supabase } from '../lib/supabase'
import { listProductosPetshop, listLotes } from './petshop'
import type {
  ResumenDashboardPetshop,
  ReporteRentabilidadPetshop,
} from '../types/views'
import type { CategoriaRetail } from '../types/database'
import { subDays, format } from 'date-fns'

/**
 * Obtiene las métricas en tiempo real para el Dashboard de Pet Shop.
 */
export async function getResumenDashboardPetshop(
  sucursalId?: string,
  fechaBase = new Date().toISOString().slice(0, 10),
): Promise<ResumenDashboardPetshop> {
  const hoyStr = fechaBase
  const ayerStr = format(subDays(new Date(fechaBase), 1), 'yyyy-MM-dd')

  // Cobros de ventas directas de hoy
  let queryHoy = supabase
    .from('cobros')
    .select(`
      *,
      lineas:cobro_lineas(*)
    `)
    .gte('created_at', `${hoyStr}T00:00:00`)
    .lte('created_at', `${hoyStr}T23:59:59`)

  if (sucursalId) queryHoy = queryHoy.eq('sucursal_id', sucursalId)

  // Cobros de ayer
  let queryAyer = supabase
    .from('cobros')
    .select('monto_bs, cobro_lineas(cantidad)')
    .gte('created_at', `${ayerStr}T00:00:00`)
    .lte('created_at', `${ayerStr}T23:59:59`)

  if (sucursalId) queryAyer = queryAyer.eq('sucursal_id', sucursalId)

  const [{ data: cobrosHoy }, { data: cobrosAyer }, productos, lotes] = await Promise.all([
    queryHoy,
    queryAyer,
    listProductosPetshop({ sucursalId, soloActivos: true }),
    listLotes({ sucursalId, diasAlerta: 60 }),
  ])

  const totalVentasHoy = (cobrosHoy || []).reduce((acc, c) => acc + (Number(c.monto_bs) || 0), 0)
  const transaccionesHoy = (cobrosHoy || []).length
  const ticketPromedioHoy = transaccionesHoy > 0 ? totalVentasHoy / transaccionesHoy : 0

  const totalVentasAyer = (cobrosAyer || []).reduce((acc, c) => acc + (Number((c as any).monto_bs) || 0), 0)
  const transaccionesAyer = (cobrosAyer || []).length

  let productosVendidosHoy = 0
  const conteoProductos = new Map<string, { nombre: string; cantidad: number; total_bs: number }>()

  for (const c of cobrosHoy || []) {
    for (const l of (c as any).lineas || []) {
      const cant = Number(l.cantidad) || 0
      const subtotal = Number(l.subtotal_bs) || 0
      productosVendidosHoy += cant

      const prodId = l.producto_id || 'otro'
      const itemPrev = conteoProductos.get(prodId) || { nombre: l.concepto, cantidad: 0, total_bs: 0 }
      itemPrev.cantidad += cant
      itemPrev.total_bs += subtotal
      conteoProductos.set(prodId, itemPrev)
    }
  }

  const productosMasVendidos = [...conteoProductos.entries()]
    .map(([id, val]) => ({
      producto_id: id,
      nombre: val.nombre,
      cantidad: val.cantidad,
      total_bs: val.total_bs,
    }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 5)

  // Alertas de stock y vencimiento
  const stockBajoCount = productos.filter((p) => Number(p.stock_actual) <= Number(p.stock_minimo)).length
  const vencidosCount = lotes.filter((l) => l.estado_vencimiento === 'vencido' || l.estado_vencimiento === 'proximo').length

  // Categorías
  const catMap = new Map<CategoriaRetail, { total_bs: number; cantidad: number }>()
  const prodCatMap = new Map<string, CategoriaRetail>(
    productos.map((p) => [p.id, (p.categoria_retail as CategoriaRetail) || 'otro']),
  )

  for (const c of cobrosHoy || []) {
    for (const l of (c as any).lineas || []) {
      const cat: CategoriaRetail = prodCatMap.get(l.producto_id) || 'otro'
      const prev = catMap.get(cat) || { total_bs: 0, cantidad: 0 }
      prev.total_bs += Number(l.subtotal_bs) || 0
      prev.cantidad += Number(l.cantidad) || 0
      catMap.set(cat, prev)
    }
  }

  const ventasPorCategoria = [...catMap.entries()].map(([cat, val]) => ({
    categoria: cat,
    total_bs: val.total_bs,
    cantidad: val.cantidad,
  }))

  const ultimasVentas = (cobrosHoy || []).slice(0, 10).map((c: any, i: number) => ({
    id: c.id,
    numero_recibo: i + 1,
    cliente_nombre: c.cliente_nombre || 'Cliente Ocasional',
    total_bs: Number(c.monto_bs),
    metodo_pago: c.metodo_pago,
    created_at: c.created_at,
    items_count: (c.lineas || []).length,
  }))

  return {
    ventas_hoy_bs: totalVentasHoy,
    ventas_ayer_bs: totalVentasAyer,
    transacciones_hoy: transaccionesHoy,
    transacciones_ayer: transaccionesAyer,
    ticket_promedio_hoy_bs: ticketPromedioHoy,
    productos_vendidos_hoy: productosVendidosHoy,
    productos_stock_bajo: stockBajoCount,
    productos_por_vencer: vencidosCount,
    ventas_mes_actual_bs: totalVentasHoy, // Ampliable con filtro mensual
    ventas_mes_anterior_bs: 0,
    ventas_por_categoria: ventasPorCategoria,
    productos_mas_vendidos: productosMasVendidos,
    ultimas_ventas: ultimasVentas,
  }
}

/**
 * Genera el reporte financiero y de rentabilidad (Ventas - Costos = Margen Bruto).
 */
export async function getReporteRentabilidad(
  sucursalId?: string,
  fechaDesde?: string,
  fechaHasta?: string,
): Promise<ReporteRentabilidadPetshop> {
  let query = supabase
    .from('cobros')
    .select(`
      *,
      lineas:cobro_lineas(*)
    `)

  if (sucursalId) query = query.eq('sucursal_id', sucursalId)
  if (fechaDesde) query = query.gte('created_at', `${fechaDesde}T00:00:00`)
  if (fechaHasta) query = query.lte('created_at', `${fechaHasta}T23:59:59`)

  const [{ data: cobros }, productos] = await Promise.all([
    query,
    listProductosPetshop({ sucursalId, soloActivos: false }),
  ])

  const prodCostoMap = new Map<string, { costo: number; cat: CategoriaRetail }>(
    productos.map((p) => [
      p.id,
      { costo: Number(p.costo_bs) || 0, cat: (p.categoria_retail as CategoriaRetail) || 'otro' },
    ]),
  )

  let totalVentas = 0
  let totalCosto = 0
  let totalArticulos = 0

  const catBreakdown = new Map<CategoriaRetail, { ventas: number; costo: number; unidades: number }>()

  for (const c of cobros || []) {
    for (const l of (c as any).lineas || []) {
      const cant = Number(l.cantidad) || 0
      const subtotal = Number(l.subtotal_bs) || 0
      const prodInfo = prodCostoMap.get(l.producto_id) || { costo: 0, cat: 'otro' as CategoriaRetail }
      const costoLinea = prodInfo.costo * cant

      totalVentas += subtotal
      totalCosto += costoLinea
      totalArticulos += cant

      const catPrev = catBreakdown.get(prodInfo.cat) || { ventas: 0, costo: 0, unidades: 0 }
      catPrev.ventas += subtotal
      catPrev.costo += costoLinea
      catPrev.unidades += cant
      catBreakdown.set(prodInfo.cat, catPrev)
    }
  }

  const margenBruto = totalVentas - totalCosto
  const margenPct = totalVentas > 0 ? (margenBruto / totalVentas) * 100 : 0

  const desglose = [...catBreakdown.entries()].map(([cat, val]) => {
    const mb = val.ventas - val.costo
    const mbPct = val.ventas > 0 ? (mb / val.ventas) * 100 : 0
    return {
      categoria: cat,
      ventas_bs: val.ventas,
      costo_bs: val.costo,
      margen_bs: mb,
      margen_pct: mbPct,
      unidades: val.unidades,
    }
  })

  return {
    total_ventas_bs: totalVentas,
    total_costo_bs: totalCosto,
    margen_bruto_bs: margenBruto,
    margen_bruto_pct: margenPct,
    total_articulos_vendidos: totalArticulos,
    total_transacciones: (cobros || []).length,
    desglose_por_categoria: desglose,
  }
}
