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
  /**
   * Identifica el intento de devolución. Un reenvío con la misma clave no
   * reintegra el stock dos veces: lo impide el índice único de `0061`.
   */
  idempotencyKey?: string
}

/** Lo que queda por devolver de un producto dentro de una venta concreta. */
export interface DisponibleParaDevolver {
  /** Unidades que esa venta cobró de ese producto. */
  vendido: number
  /** Unidades ya devueltas contra esa misma venta. */
  yaDevuelto: number
  /** `vendido - yaDevuelto`, nunca negativo. */
  disponible: number
  /** Precio unitario **de esa venta**, no el del catálogo de hoy. */
  precioUnitarioBs: number
}

/**
 * Cuánto se puede devolver todavía de un producto en una venta.
 *
 * Es el espejo en el cliente de `trg_validar_devolucion` (migración 0056): la
 * barrera real vive en la base, y esto existe para que el modal enseñe el
 * límite mientras se escribe en vez de fallar al pulsar «Confirmar».
 *
 * ⚠️ El precio sale de `cobro_lineas`, no de `productos`: si el catálogo subió
 * de precio desde la venta, devolver al precio de hoy sería devolver de más —
 * y la base lo rechazaría.
 */
export async function getDisponibleParaDevolver(
  cobroId: string,
  productoId: string,
): Promise<DisponibleParaDevolver> {
  const [{ data: lineas, error: errorLineas }, { data: devoluciones, error: errorDev }] = await Promise.all([
    supabase
      .from('cobro_lineas')
      .select('cantidad, precio_unitario_bs')
      .eq('cobro_id', cobroId)
      .eq('producto_id', productoId),
    supabase
      .from('petshop_devoluciones')
      .select('cantidad')
      .eq('cobro_id', cobroId)
      .eq('producto_id', productoId),
  ])

  if (errorLineas) throw new Error(`No se pudo leer la venta original: ${errorLineas.message}`)
  if (errorDev) throw new Error(`No se pudieron leer las devoluciones previas: ${errorDev.message}`)

  const vendido = (lineas ?? []).reduce((n, l) => n + Number(l.cantidad), 0)
  const yaDevuelto = (devoluciones ?? []).reduce((n, d) => n + Number(d.cantidad), 0)
  const precioUnitarioBs = (lineas ?? []).reduce((max, l) => Math.max(max, Number(l.precio_unitario_bs)), 0)

  return {
    vendido,
    yaDevuelto,
    disponible: Math.max(0, Number((vendido - yaDevuelto).toFixed(2))),
    precioUnitarioBs,
  }
}

/**
 * Procesa una devolución de Pet Shop de forma controlada y auditable.
 *
 * Las comprobaciones de aquí son **avisos tempranos**, no la barrera: la
 * barrera es `trg_validar_devolucion` en la base (migración 0056), que se
 * aplica igual a quien llame a PostgREST directamente sin pasar por aquí.
 * Mismo criterio que `registrarMovimiento` con «Stock insuficiente».
 */
export async function procesarDevolucion(datos: DatosDevolucionInput): Promise<PetshopDevolucion> {
  if (datos.cantidad <= 0) throw new Error('La cantidad a devolver debe ser mayor a 0')
  if (!datos.motivo.trim()) throw new Error('El motivo de la devolución es obligatorio')

  if (datos.cobroId) {
    const { vendido, yaDevuelto, disponible, precioUnitarioBs } = await getDisponibleParaDevolver(
      datos.cobroId,
      datos.productoId,
    )

    if (vendido === 0) {
      throw new Error('Ese producto no aparece en la venta seleccionada')
    }
    if (datos.cantidad > disponible) {
      throw new Error(
        `Solo quedan ${disponible} por devolver de esa venta (se vendieron ${vendido} y ya se devolvieron ${yaDevuelto})`,
      )
    }
    const topeMonto = Number((precioUnitarioBs * datos.cantidad).toFixed(2))
    if (datos.montoDevueltoBs > topeMonto + 0.01) {
      throw new Error(
        `El monto a devolver no puede superar lo cobrado por esa cantidad (Bs. ${topeMonto.toFixed(2)})`,
      )
    }
  }

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
      idempotency_key: datos.idempotencyKey ?? null,
    })
    .select()
    .single()

  if (error || !dev) {
    // Reenvío de una devolución ya registrada: se devuelve la original en vez
    // de reintegrar el stock una segunda vez.
    if ((error as { code?: string } | null)?.code === '23505' && datos.idempotencyKey) {
      const { data: original } = await supabase
        .from('petshop_devoluciones')
        .select('*')
        .eq('idempotency_key', datos.idempotencyKey)
        .maybeSingle()
      if (original) return original as unknown as PetshopDevolucion
    }
    throw new Error(`Error al registrar devolución: ${error?.message || 'desconocido'}`)
  }

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
