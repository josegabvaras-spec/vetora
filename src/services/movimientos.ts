import { supabase } from '../lib/supabase'
import { clinicDayIso, fromClinicTime } from '../lib/datetime'
import { componerDetalleDeCobros } from './caja'
import type { MovimientoUnificado, OrigenMovimiento } from '../types/views'

/**
 * Tope de la bitácora. Es un informe que se mira, no un export: con más de
 * quinientas líneas nadie lo lee, y el respaldo de `/respaldo` es el camino
 * para llevarse todo.
 */
const TOPE_MOVIMIENTOS = 500

export interface FiltroMovimientos {
  /** Fechas en formato yyyy-MM-dd; se comparan contra la fecha de la clínica. */
  desde?: string
  hasta?: string
  sucursalId?: string
  origen?: OrigenMovimiento
}

export interface ResumenMovimientos {
  ingresos_bs: number
  efectivo_bs: number
  qr_bs: number
  cantidad_caja: number
  cantidad_inventario: number
}

/**
 * Bitácora que ve el administrador: mezcla los cobros de caja con las entradas
 * y salidas de inventario, que hasta ahora se registraban pero no se mostraban
 * en ninguna pantalla.
 */
export async function listMovimientos(filtro: FiltroMovimientos = {}): Promise<MovimientoUnificado[]> {
  // El filtro de fechas se empuja a la consulta en vez de aplicarse en memoria.
  //
  // `desde`/`hasta` son días de la clínica ('yyyy-MM-dd') y `created_at` es un
  // TIMESTAMPTZ, así que los extremos se convierten a instantes con
  // `fromClinicTime`: el día completo va de su medianoche a la del siguiente.
  // Sin esto se traía la tabla entera de cobros y de movimientos —ambas crecen
  // sin techo— para descartar casi todo, y por encima de 1000 filas el informe
  // salía incompleto sin avisar.
  function acotar<T extends { gte: any; lt: any }>(query: T): T {
    let q = query
    if (filtro.desde) q = q.gte('created_at', fromClinicTime(`${filtro.desde}T00:00:00`))
    if (filtro.hasta) {
      const siguiente = new Date(`${filtro.hasta}T00:00:00Z`)
      siguiente.setUTCDate(siguiente.getUTCDate() + 1)
      q = q.lt('created_at', fromClinicTime(`${siguiente.toISOString().slice(0, 10)}T00:00:00`))
    }
    return q
  }

  // Tope explícito, como en `listInternaciones`. Sin él, un rango de fechas
  // amplio se traía todos los cobros y componía el detalle de cada uno: el
  // corte de 1000 filas de PostgREST llegaba igual, pero en silencio y sin
  // garantizar cuáles se quedaban fuera.
  const { data: cobros, error: errorCobros } = await acotar(
    supabase.from('cobros').select('*').order('created_at', { ascending: false }).limit(TOPE_MOVIMIENTOS) as any,
  )
  if (errorCobros) throw new Error(`No se pudo cargar la caja: ${errorCobros.message}`)

  const { data: movimientosInv, error: errorInv } = await acotar(
    supabase
      .from('movimientos_inventario')
      .select('*, producto:productos(*), usuario:usuarios(*)') as any,
  )
  // Sin comprobar el error, un embed roto dejaba `data` en null y la mitad de
  // inventario de la bitácora salía vacía como si nunca hubiera habido stock.
  if (errorInv) throw new Error(`No se pudo cargar el inventario: ${errorInv.message}`)


  // Una consulta por tabla para TODO el lote, en vez de cuatro o cinco por
  // cobro. Con 300 cobros eso eran más de mil peticiones encadenadas.
  const detalles = await componerDetalleDeCobros((cobros || []) as any[])
  const detallePorCobro = new Map(detalles.map((d) => [d.id, d]))

  const deCaja: MovimientoUnificado[] = (cobros || []).map((c: any) => {
    const detalle = detallePorCobro.get(c.id)!
    return {
      id: c.id,
      origen: 'caja',
      fecha: c.created_at,
      sucursal_id: c.sucursal_id,
      descripcion: `Cobro · ${detalle.paciente_nombre}`,
      detalle: detalle.concepto_atencion,
      monto_bs: c.monto_bs,
      metodo_pago: c.metodo_pago as any,
    } as MovimientoUnificado
  })

  const deInventario: MovimientoUnificado[] = (movimientosInv || []).map((m: any) => {
    const porUsuario = m.usuario ? ` (por ${m.usuario.nombre})` : ''
    return {
      id: m.id,
      origen: 'inventario',
      fecha: m.created_at,
      sucursal_id: m.producto?.sucursal_id ?? null,
      descripcion: `${m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'} · ${m.producto?.nombre ?? 'Producto'}`,
      detalle: `${m.cantidad} u. · ${m.motivo || 'Sin motivo'}${porUsuario}`,
      monto_bs: null,
    }
  })

  const result = [...deCaja, ...deInventario]
    .filter((m) => !filtro.origen || m.origen === filtro.origen)
    .filter((m) => !filtro.sucursalId || m.sucursal_id === filtro.sucursalId)
    // `m.fecha` es un TIMESTAMPTZ: cortarlo con slice daba el día UTC, así que
    // toda la caja de 20:00 a medianoche caía en el informe del día siguiente.
    .filter((m) => !filtro.desde || clinicDayIso(m.fecha) >= filtro.desde)
    .filter((m) => !filtro.hasta || clinicDayIso(m.fecha) <= filtro.hasta)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))

  return result
}

export function resumirMovimientos(movimientos: MovimientoUnificado[]): ResumenMovimientos {
  const caja = movimientos.filter((m) => m.origen === 'caja')
  const efectivo = caja.filter((m) => m.metodo_pago === 'efectivo').reduce((n, m) => n + (m.monto_bs ?? 0), 0)
  const qr = caja.filter((m) => m.metodo_pago === 'qr').reduce((n, m) => n + (m.monto_bs ?? 0), 0)

  return {
    ingresos_bs: Number((efectivo + qr).toFixed(2)),
    efectivo_bs: Number(efectivo.toFixed(2)),
    qr_bs: Number(qr.toFixed(2)),
    cantidad_caja: caja.length,
    cantidad_inventario: movimientos.length - caja.length,
  }
}
