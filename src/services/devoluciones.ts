import { supabase } from '../lib/supabase'
import { dosisDesdeEnvases } from '../lib/inventario'
import { registrarMovimiento } from './inventario'
import type {
  PetshopDevolucion,
  EstadoProductoDevolucion,
} from '../types/database'
import type { PetshopDevolucionConDetalle } from '../types/views'

export const ESTADO_DEVOLUCION_LABEL: Record<EstadoProductoDevolucion, string> = {
  reintegrable: 'Reintegrable a Inventario',
  danado: 'Dañado / No Reintegrable',
  descarte: 'Descarte / Pérdida',
}

/**
 * Lista devoluciones de Pet Shop con detalles de producto y usuario.
 */
export async function listDevoluciones(filtros: {
  sucursalId?: string
} = {}): Promise<PetshopDevolucionConDetalle[]> {
  let query = supabase
    .from('petshop_devoluciones')
    .select(`
      *,
      producto:productos(*),
      cobro:cobros(*),
      usuario:usuarios!petshop_devoluciones_usuario_id_fkey(*),
      autorizado:usuarios!petshop_devoluciones_autorizado_por_fkey(*)
    `)
    .order('created_at', { ascending: false })

  if (filtros.sucursalId) query = query.eq('sucursal_id', filtros.sucursalId)

  const { data, error } = await query
  if (error) throw new Error(`Error al listar devoluciones: ${error.message}`)

  return (data || []) as unknown as PetshopDevolucionConDetalle[]
}

export interface DatosDevolucionInput {
  sucursalId: string
  cobroId?: string
  productoId: string
  cantidad: number
  motivo: string
  estadoProducto: EstadoProductoDevolucion
  montoDevueltoBs: number
  usuarioId?: string
  autorizadoPor?: string
}

/**
 * Procesa una devolución de Pet Shop de forma controlada y auditable.
 */
export async function procesarDevolucion(datos: DatosDevolucionInput): Promise<PetshopDevolucion> {
  if (datos.cantidad <= 0) throw new Error('La cantidad a devolver debe ser mayor a 0')
  if (!datos.motivo.trim()) throw new Error('El motivo de la devolución es obligatorio')

  // 1. Registrar devolución
  const { data: dev, error } = await supabase
    .from('petshop_devoluciones')
    .insert({
      sucursal_id: datos.sucursalId,
      cobro_id: datos.cobroId || null,
      producto_id: datos.productoId,
      cantidad: datos.cantidad,
      motivo: datos.motivo.trim(),
      estado_producto: datos.estadoProducto,
      monto_devuelto_bs: datos.montoDevueltoBs,
      usuario_id: datos.usuarioId || null,
      autorizado_por: datos.autorizadoPor || null,
    })
    .select()
    .single()

  if (error || !dev) throw new Error(`Error al registrar devolución: ${error?.message || 'desconocido'}`)

  // 2. Si el producto es reintegrable, retornar stock al inventario
  if (datos.estadoProducto === 'reintegrable') {
    const { data: prod } = await supabase
      .from('productos')
      .select('contenido_presentacion, nombre')
      .eq('id', datos.productoId)
      .single()

    const contenido = prod?.contenido_presentacion || 1
    const dosisIngreso = dosisDesdeEnvases(datos.cantidad, contenido)

    await registrarMovimiento(
      datos.productoId,
      'ingreso',
      dosisIngreso,
      `Devolución de cliente: ${datos.motivo}`,
      { usuarioId: datos.usuarioId },
    )
  }

  return dev as unknown as PetshopDevolucion
}
