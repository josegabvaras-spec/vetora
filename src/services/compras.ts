import { supabase } from '../lib/supabase'
import { dosisDesdeEnvases } from '../lib/inventario'
import { registrarMovimiento } from './inventario'
import { crearLote } from './petshop'
import type {
  Proveedor,
  OrdenCompra,
  EstadoOrdenCompra,
} from '../types/database'
import type { OrdenCompraConDetalle } from '../types/views'

/**
 * Listado de proveedores registrados.
 */
export async function listProveedores(): Promise<Proveedor[]> {
  const { data, error } = await supabase
    .from('proveedores')
    .select('*')
    .eq('activo', true)
    .order('empresa', { ascending: true })

  if (error) throw new Error(`Error al listar proveedores: ${error.message}`)
  return (data || []) as unknown as Proveedor[]
}

export interface DatosProveedor {
  empresa: string
  nit?: string
  contacto?: string
  telefono?: string
  whatsapp?: string
  direccion?: string
  email?: string
  notas?: string
}

/**
 * Crea un nuevo proveedor.
 */
export async function crearProveedor(datos: DatosProveedor): Promise<Proveedor> {
  if (!datos.empresa.trim()) throw new Error('El nombre de la empresa es obligatorio')

  const { data, error } = await supabase
    .from('proveedores')
    .insert({
      empresa: datos.empresa.trim(),
      nit: datos.nit?.trim() || null,
      contacto: datos.contacto?.trim() || null,
      telefono: datos.telefono?.trim() || null,
      whatsapp: datos.whatsapp?.trim() || null,
      direccion: datos.direccion?.trim() || null,
      email: datos.email?.trim() || null,
      notas: datos.notas?.trim() || null,
      saldo_pendiente_bs: 0,
      activo: true,
    })
    .select()
    .single()

  if (error || !data) throw new Error(`Error al crear proveedor: ${error?.message || 'desconocido'}`)
  return data as unknown as Proveedor
}

/**
 * Actualiza un proveedor existente.
 */
export async function actualizarProveedor(id: string, datos: Partial<DatosProveedor>): Promise<void> {
  const payload: any = {}
  if (datos.empresa !== undefined) payload.empresa = datos.empresa.trim()
  if (datos.nit !== undefined) payload.nit = datos.nit.trim() || null
  if (datos.contacto !== undefined) payload.contacto = datos.contacto.trim() || null
  if (datos.telefono !== undefined) payload.telefono = datos.telefono.trim() || null
  if (datos.whatsapp !== undefined) payload.whatsapp = datos.whatsapp.trim() || null
  if (datos.direccion !== undefined) payload.direccion = datos.direccion.trim() || null
  if (datos.email !== undefined) payload.email = datos.email.trim() || null
  if (datos.notas !== undefined) payload.notas = datos.notas.trim() || null

  const { error } = await supabase.from('proveedores').update(payload).eq('id', id)
  if (error) throw new Error(`Error al actualizar proveedor: ${error.message}`)
}

export interface ItemOrdenCompraInput {
  productoId: string
  cantidadPedida: number
  costoUnitarioBs: number
  lote?: string
  fechaVencimiento?: string
}

export interface DatosNuevaOrdenCompra {
  sucursalId: string
  proveedorId: string
  descuentoBs?: number
  notas?: string
  items: ItemOrdenCompraInput[]
  usuarioId?: string
}

/**
 * Lista órdenes de compra con proveedor y detalles de productos.
 */
export async function listOrdenesCompra(filtros: {
  sucursalId?: string
  proveedorId?: string
  estado?: EstadoOrdenCompra
} = {}): Promise<OrdenCompraConDetalle[]> {
  let query = supabase
    .from('ordenes_compra')
    .select(`
      *,
      proveedor:proveedores(*),
      detalles:orden_compra_detalles(
        *,
        producto:productos(*)
      ),
      creador:usuarios!ordenes_compra_creado_por_fkey(*),
      receptor:usuarios!ordenes_compra_recibido_por_fkey(*)
    `)
    .order('created_at', { ascending: false })

  if (filtros.sucursalId) query = query.eq('sucursal_id', filtros.sucursalId)
  if (filtros.proveedorId) query = query.eq('proveedor_id', filtros.proveedorId)
  if (filtros.estado) query = query.eq('estado', filtros.estado)

  const { data, error } = await query
  if (error) throw new Error(`Error al listar órdenes de compra: ${error.message}`)

  return (data || []) as unknown as OrdenCompraConDetalle[]
}

/**
 * Crea una orden de compra y sus líneas de detalle.
 */
export async function crearOrdenCompra(datos: DatosNuevaOrdenCompra): Promise<OrdenCompra> {
  if (datos.items.length === 0) throw new Error('La orden debe incluir al menos un producto')

  const subtotal = datos.items.reduce((acc, item) => acc + item.cantidadPedida * item.costoUnitarioBs, 0)
  const descuento = datos.descuentoBs || 0
  const total = Math.max(0, subtotal - descuento)

  const { data: orden, error } = await supabase
    .from('ordenes_compra')
    .insert({
      sucursal_id: datos.sucursalId,
      proveedor_id: datos.proveedorId,
      estado: 'borrador',
      subtotal_bs: subtotal,
      descuento_bs: descuento,
      total_bs: total,
      notas: datos.notas || null,
      creado_por: datos.usuarioId || null,
      fecha_solicitud: new Date().toISOString(),
    })
    .select()
    .single()

  if (error || !orden) throw new Error(`Error al crear orden de compra: ${error?.message || 'desconocido'}`)

  const detalles = datos.items.map((i) => ({
    orden_id: orden.id,
    producto_id: i.productoId,
    cantidad_pedida: i.cantidadPedida,
    cantidad_recibida: 0,
    costo_unitario_bs: i.costoUnitarioBs,
    subtotal_bs: i.cantidadPedida * i.costoUnitarioBs,
    lote: i.lote || null,
    fecha_vencimiento: i.fechaVencimiento || null,
  }))

  const { error: errDetalles } = await supabase.from('orden_compra_detalles').insert(detalles)
  if (errDetalles) throw new Error(`Error al guardar detalles de la compra: ${errDetalles.message}`)

  return orden as unknown as OrdenCompra
}

export interface ItemRecepcionInput {
  detalleId: string
  productoId: string
  cantidadRecibida: number
  costoUnitarioBs: number
  lote?: string
  fechaVencimiento?: string
}

/**
 * Procesa la recepción física de una orden de compra:
 * - Actualiza las cantidades recibidas de la orden.
 * - Registra los movimientos de inventario tipo 'ingreso'.
 * - Crea los lotes con sus fechas de vencimiento si corresponde.
 * - Cambia el estado de la orden a 'recibida'.
 */
export async function recibirOrdenCompra(
  ordenId: string,
  sucursalId: string,
  itemsRecibidos: ItemRecepcionInput[],
  usuarioId?: string,
): Promise<void> {
  const { data: orden, error: errOrden } = await supabase
    .from('ordenes_compra')
    .select('*, proveedor:proveedores(*)')
    .eq('id', ordenId)
    .single()

  if (errOrden || !orden) throw new Error('Orden de compra no encontrada')

  for (const item of itemsRecibidos) {
    if (item.cantidadRecibida > 0) {
      // 1. Actualizar el detalle de la orden
      await supabase
        .from('orden_compra_detalles')
        .update({
          cantidad_recibida: item.cantidadRecibida,
          costo_unitario_bs: item.costoUnitarioBs,
          lote: item.lote || null,
          fecha_vencimiento: item.fechaVencimiento || null,
        })
        .eq('id', item.detalleId)

      // 2. Obtener producto para conocer contenido_presentacion
      const { data: producto } = await supabase
        .from('productos')
        .select('contenido_presentacion, costo_bs')
        .eq('id', item.productoId)
        .single()

      const contenido = producto?.contenido_presentacion || 1
      const dosisIngreso = dosisDesdeEnvases(item.cantidadRecibida, contenido)

      // 3. Registrar movimiento de inventario
      await registrarMovimiento(
        item.productoId,
        'ingreso',
        dosisIngreso,
        `Recepción Compra #${orden.numero_orden}`,
        { usuarioId },
      )

      // 4. Actualizar costo de referencia del producto
      if (item.costoUnitarioBs > 0) {
        await supabase
          .from('productos')
          .update({ costo_bs: item.costoUnitarioBs })
          .eq('id', item.productoId)
      }

      // 5. Crear lote si se especificó número de lote y fecha de vencimiento
      if (item.lote && item.fechaVencimiento) {
        await crearLote({
          sucursalId,
          productoId: item.productoId,
          numeroLote: item.lote,
          fechaVencimiento: item.fechaVencimiento,
          cantidad: item.cantidadRecibida,
          costoUnitarioBs: item.costoUnitarioBs,
          proveedorId: orden.proveedor_id,
        })
      }
    }
  }

  // Marcar orden como recibida
  const { error: errUpdate } = await supabase
    .from('ordenes_compra')
    .update({
      estado: 'recibida',
      recibido_por: usuarioId || null,
      fecha_recepcion: new Date().toISOString(),
    })
    .eq('id', ordenId)

  if (errUpdate) throw new Error(`Error al actualizar estado de la orden: ${errUpdate.message}`)
}
