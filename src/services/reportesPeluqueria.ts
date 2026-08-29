import { supabase } from '../lib/supabase'
import { fromClinicTime } from '../lib/datetime'

export interface ReporteOperativoPeluqueria {
  totalServicios: number
  completados: number
  cancelados: number
  ticketPromedioBs: number
  totalIngresosBs: number
  totalComisionesBs: number
  totalCostoInsumosBs: number
  margenEstimadoBs: number
  porPeluquero: {
    peluqueroId: string
    nombre: string
    servicios: number
    ingresosBs: number
    comisionesBs: number
  }[]
  porServicio: {
    servicioId: string
    nombre: string
    categoria: string
    cantidad: number
    ingresosBs: number
  }[]
  porDia: {
    fecha: string
    servicios: number
    ingresosBs: number
  }[]
}

/** Carga el reporte completo de rentabilidad y operaciones de peluquería */
export async function getReportePeluqueria(
  sucursalId?: string,
  desde?: string,
  hasta?: string,
): Promise<ReporteOperativoPeluqueria> {
  let ordenesQuery: any = supabase
    .from('peluqueria_ordenes')
    .select(`
      *,
      peluquero:usuarios(*),
      servicio:servicios(*)
    `)

  if (sucursalId) ordenesQuery = ordenesQuery.eq('sucursal_id', sucursalId)
  if (desde) ordenesQuery = ordenesQuery.gte('created_at', fromClinicTime(`${desde}T00:00:00`))
  if (hasta) ordenesQuery = ordenesQuery.lte('created_at', fromClinicTime(`${hasta}T23:59:59`))

  const { data: ordenes, error } = await ordenesQuery
  if (error) throw new Error(`Error al generar reporte: ${error.message}`)

  const totalServicios = (ordenes || []).length
  let completados = 0
  let cancelados = 0
  let totalIngresos = 0

  const peluquerosMap = new Map<string, { nombre: string; servicios: number; ingresos: number; comisiones: number }>()
  const serviciosMap = new Map<string, { nombre: string; categoria: string; cantidad: number; ingresos: number }>()
  const diasMap = new Map<string, { servicios: number; ingresos: number }>()

  const ordenIds: string[] = []

  for (const o of (ordenes || []) as any[]) {
    ordenIds.push(o.id)
    const fecha = o.created_at.slice(0, 10)
    const precio = Number(o.precio_final_bs) || 0

    if (o.estado === 'terminada' || o.estado === 'lista_recoger' || o.estado === 'entregada') {
      completados++
      totalIngresos += precio

      // Por día
      const diaObj = diasMap.get(fecha) || { servicios: 0, ingresos: 0 }
      diaObj.servicios++
      diaObj.ingresos += precio
      diasMap.set(fecha, diaObj)

      // Por peluquero
      const pelId = o.peluquero_id
      const pelNom = o.peluquero?.nombre || 'Peluquero'
      const pelObj = peluquerosMap.get(pelId) || { nombre: pelNom, servicios: 0, ingresos: 0, comisiones: 0 }
      pelObj.servicios++
      pelObj.ingresos += precio
      peluquerosMap.set(pelId, pelObj)

      // Por servicio
      const servId = o.servicio_id || 'sin_servicio'
      const servNom = o.servicio?.nombre || 'Servicio personalizado'
      const servCat = o.servicio?.categoria || 'peluqueria'
      const servObj = serviciosMap.get(servId) || { nombre: servNom, categoria: servCat, cantidad: 0, ingresos: 0 }
      servObj.cantidad++
      servObj.ingresos += precio
      serviciosMap.set(servId, servObj)
    } else if (o.estado === 'cancelada') {
      cancelados++
    }
  }

  // Cargar comisiones asociadas
  let comisionesTotal = 0
  if (ordenIds.length > 0) {
    const { data: comisiones } = await supabase
      .from('peluqueria_comisiones')
      .select('peluquero_id, monto_comision_bs')
      .in('orden_id', ordenIds)
      .neq('estado', 'anulada')

    for (const c of comisiones || []) {
      const monto = Number(c.monto_comision_bs) || 0
      comisionesTotal += monto
      const pelObj = peluquerosMap.get(c.peluquero_id)
      if (pelObj) pelObj.comisiones += monto
    }
  }

  // Costo estimado de insumos (aproximado 10% de ingresos de servicios o insumos registrados)
  const costoInsumosEstimado = Number((totalIngresos * 0.08).toFixed(2))
  const margenEstimado = Number((totalIngresos - comisionesTotal - costoInsumosEstimado).toFixed(2))
  const ticketPromedio = completados > 0 ? Number((totalIngresos / completados).toFixed(2)) : 0

  const porPeluquero = Array.from(peluquerosMap.entries()).map(([id, p]) => ({
    peluqueroId: id,
    nombre: p.nombre,
    servicios: p.servicios,
    ingresosBs: Number(p.ingresos.toFixed(2)),
    comisionesBs: Number(p.comisiones.toFixed(2)),
  }))

  const porServicio = Array.from(serviciosMap.entries())
    .map(([id, s]) => ({
      servicioId: id,
      nombre: s.nombre,
      categoria: s.categoria,
      cantidad: s.cantidad,
      ingresosBs: Number(s.ingresos.toFixed(2)),
    }))
    .sort((a, b) => b.cantidad - a.cantidad)

  const porDia = Array.from(diasMap.entries())
    .map(([fecha, d]) => ({
      fecha,
      servicios: d.servicios,
      ingresosBs: Number(d.ingresos.toFixed(2)),
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  return {
    totalServicios,
    completados,
    cancelados,
    ticketPromedioBs: ticketPromedio,
    totalIngresosBs: Number(totalIngresos.toFixed(2)),
    totalComisionesBs: Number(comisionesTotal.toFixed(2)),
    totalCostoInsumosBs: costoInsumosEstimado,
    margenEstimadoBs: margenEstimado,
    porPeluquero,
    porServicio,
    porDia,
  }
}
