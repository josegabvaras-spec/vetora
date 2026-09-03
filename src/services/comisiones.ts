import { supabase } from '../lib/supabase'
import type { PeluqueriaComisionConDetalle } from '../types/views'
import { fromClinicTime } from '../lib/datetime'

export interface FiltrosComisiones {
  sucursalId?: string
  peluqueroId?: string
  estado?: 'pendiente' | 'liquidada' | 'anulada'
  desde?: string
  hasta?: string
}

/** Carga el historial de comisiones de peluqueros con detalle de la orden, paciente y servicio */
export async function listComisiones(filtros: FiltrosComisiones = {}): Promise<PeluqueriaComisionConDetalle[]> {
  let query = supabase
    .from('peluqueria_comisiones')
    .select(`
      *,
      peluquero:usuarios!peluqueria_comisiones_peluquero_id_fkey(*),
      orden:peluqueria_ordenes(
        *,
        paciente:pacientes(*),
        cliente:clientes(*),
        servicio:servicios(*)
      )
    `)
    .order('created_at', { ascending: false })

  if (filtros.sucursalId) query = query.eq('sucursal_id', filtros.sucursalId)
  if (filtros.peluqueroId) query = query.eq('peluquero_id', filtros.peluqueroId)
  if (filtros.estado) query = query.eq('estado', filtros.estado)

  if (filtros.desde) {
    query = query.gte('created_at', fromClinicTime(`${filtros.desde}T00:00:00`))
  }
  if (filtros.hasta) {
    query = query.lte('created_at', fromClinicTime(`${filtros.hasta}T23:59:59`))
  }

  const { data, error } = await query
  if (error) throw new Error(`Error al cargar comisiones: ${error.message}`)

  return (data || []) as unknown as PeluqueriaComisionConDetalle[]
}

/** Liquida un lote de comisiones pendientes marcándolas como pagadas */
export async function liquidarComisiones(ids: string[], usuarioId: string): Promise<void> {
  if (ids.length === 0) return

  const { error } = await supabase
    .from('peluqueria_comisiones')
    .update({
      estado: 'liquidada',
      fecha_liquidacion: new Date().toISOString(),
      liquidada_por: usuarioId,
    })
    .in('id', ids)
    .eq('estado', 'pendiente')

  if (error) throw new Error(`Error al liquidar comisiones: ${error.message}`)
}

/** Resumen de comisiones por peluquero */
export interface ResumenComisionesPeluquero {
  peluqueroId: string
  peluqueroNombre: string
  totalServicios: number
  ingresosGeneradosBs: number
  comisionPendienteBs: number
  comisionLiquidadaBs: number
  totalComisionBs: number
}

export async function getResumenComisionesPorPeluquero(sucursalId?: string): Promise<ResumenComisionesPeluquero[]> {
  const comisiones = await listComisiones({ sucursalId })

  const map = new Map<string, ResumenComisionesPeluquero>()

  for (const c of comisiones) {
    const id = c.peluquero_id
    const nombre = c.peluquero?.nombre || 'Peluquero'
    const actual = map.get(id) || {
      peluqueroId: id,
      peluqueroNombre: nombre,
      totalServicios: 0,
      ingresosGeneradosBs: 0,
      comisionPendienteBs: 0,
      comisionLiquidadaBs: 0,
      totalComisionBs: 0,
    }

    actual.totalServicios += 1
    actual.ingresosGeneradosBs += Number(c.monto_base_bs) || 0
    const com = Number(c.monto_comision_bs) || 0
    actual.totalComisionBs += com

    if (c.estado === 'pendiente') {
      actual.comisionPendienteBs += com
    } else if (c.estado === 'liquidada') {
      actual.comisionLiquidadaBs += com
    }

    map.set(id, actual)
  }

  return Array.from(map.values()).map((r) => ({
    ...r,
    ingresosGeneradosBs: Number(r.ingresosGeneradosBs.toFixed(2)),
    comisionPendienteBs: Number(r.comisionPendienteBs.toFixed(2)),
    comisionLiquidadaBs: Number(r.comisionLiquidadaBs.toFixed(2)),
    totalComisionBs: Number(r.totalComisionBs.toFixed(2)),
  }))
}
