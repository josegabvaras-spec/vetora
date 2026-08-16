import { supabase } from '../lib/supabase'
import { detalleDeCobro } from './caja'
import type { MovimientoUnificado, OrigenMovimiento } from '../types/views'

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
  const { data: cobros } = await supabase.from('cobros').select('*')
  const { data: movimientosInv } = await supabase.from('movimientos_inventario').select('*, producto:productos(*), usuario:usuarios(*)')
  
  const deCaja: MovimientoUnificado[] = await Promise.all((cobros || []).map(async (c) => {
    const detalle = await detalleDeCobro(c as any)
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
  }))

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
    .filter((m) => !filtro.desde || m.fecha.slice(0, 10) >= filtro.desde)
    .filter((m) => !filtro.hasta || m.fecha.slice(0, 10) <= filtro.hasta)
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
