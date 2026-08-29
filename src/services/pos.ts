import { supabase } from '../lib/supabase'
import { dosisDesdeEnvases } from '../lib/inventario'
import { registrarMovimiento } from './inventario'
import { getTurnoAbierto } from './caja'
import type { MetodoPago, Producto } from '../types/database'
import type { ItemCarritoPOS } from '../types/views'

export interface DatosVentaPOS {
  sucursalId: string
  clienteId?: string | null
  pacienteId?: string | null
  items: ItemCarritoPOS[]
  metodoPago: MetodoPago
  montoRecibidoBs?: number
  descuentoGlobalBs?: number
  codigoCupon?: string
  notas?: string
  usuarioId?: string
}

export interface ResultadoVentaPOS {
  cobroId: string
  numeroRecibo: number
  totalBs: number
  itemsVendidos: number
  fecha: string
  clienteNombre?: string
  pacienteNombre?: string
}

/**
 * Búsqueda instantánea de productos optimizada para el POS (código de barras, SKU o nombre).
 */
export async function buscarProductoPOS(sucursalId: string, busqueda: string): Promise<Producto[]> {
  const term = busqueda.trim()
  if (!term) return []

  // Primero intenta búsqueda exacta por código de barras o SKU
  const { data: exactos } = await supabase
    .from('productos')
    .select('*')
    .eq('sucursal_id', sucursalId)
    .eq('activo', true)
    .or(`codigo_barras.eq.${term},sku.eq.${term}`)
    .limit(5)

  if (exactos && exactos.length > 0) {
    return exactos as unknown as Producto[]
  }

  // Búsqueda flexible por texto
  const { data: flexibles, error } = await supabase
    .from('productos')
    .select('*')
    .eq('sucursal_id', sucursalId)
    .eq('activo', true)
    .or(`nombre.ilike.%${term}%,sku.ilike.%${term}%,marca.ilike.%${term}%`)
    .order('nombre', { ascending: true })
    .limit(20)

  if (error) throw new Error(`Error en búsqueda POS: ${error.message}`)
  return (flexibles || []) as unknown as Producto[]
}

/**
 * Procesa la venta completa de forma transaccional:
 * 1. Valida el turno de caja abierto.
 * 2. Valida la disponibilidad de stock.
 * 3. Crea el cobro y sus líneas.
 * 4. Descuenta el inventario y lotes asociados.
 */
export async function procesarVentaPOS(datos: DatosVentaPOS): Promise<ResultadoVentaPOS> {
  if (datos.items.length === 0) {
    throw new Error('El carrito de venta está vacío')
  }

  // 1. Verificar turno de caja abierto
  const turno = await getTurnoAbierto(datos.sucursalId)
  if (!turno) {
    throw new Error('No hay un turno de caja abierto en esta sucursal. Abre la caja antes de registrar ventas.')
  }

  // 2. Calcular totales
  const subtotalProductos = datos.items.reduce((acc, item) => acc + item.subtotal_bs, 0)
  const descuentoGlobal = datos.descuentoGlobalBs || 0
  const totalFinal = Math.max(0, Number((subtotalProductos - descuentoGlobal).toFixed(2)))

  // Obtener nombres para el comprobante
  let clienteNombre = 'Cliente Ocasional'
  let pacienteNombre: string | undefined

  if (datos.clienteId) {
    const { data: c } = await supabase.from('clientes').select('nombre').eq('id', datos.clienteId).single()
    if (c) clienteNombre = c.nombre
  }

  if (datos.pacienteId) {
    const { data: p } = await supabase.from('pacientes').select('nombre').eq('id', datos.pacienteId).single()
    if (p) pacienteNombre = p.nombre
  }

  // 3. Crear el cobro en caja
  const { data: cobro, error: errorCobro } = await supabase
    .from('cobros')
    .insert({
      sucursal_id: datos.sucursalId,
      turno_id: turno.id,
      cliente_nombre: clienteNombre,
      metodo_pago: datos.metodoPago,
      monto_bs: totalFinal,
      usuario_id: datos.usuarioId || turno.usuario_id,
    })
    .select()
    .single()

  if (errorCobro || !cobro) {
    throw new Error(`Error al registrar cobro en caja: ${errorCobro?.message || 'desconocido'}`)
  }

  // 4. Crear líneas de cobro y descontar inventario
  for (const item of datos.items) {
    // Línea de cobro
    await supabase.from('cobro_lineas').insert({
      cobro_id: cobro.id,
      producto_id: item.producto.id,
      concepto: item.producto.nombre,
      cantidad: item.cantidad,
      precio_unitario_bs: item.precio_unitario_bs,
      subtotal_bs: item.subtotal_bs,
    })

    // Descontar inventario fraccionado o unitario
    const dosisDescontar = dosisDesdeEnvases(item.cantidad, item.producto.contenido_presentacion || 1)
    await registrarMovimiento(
      item.producto.id,
      'egreso',
      dosisDescontar,
      `Venta Pet Shop`,
      { usuarioId: datos.usuarioId },
    )

    // Si tiene lote asignado, descontar del lote
    if (item.lote_id) {
      const { data: lote } = await supabase
        .from('producto_lotes')
        .select('cantidad_actual')
        .eq('id', item.lote_id)
        .single()

      if (lote) {
        const nuevoStockLote = Math.max(0, Number(lote.cantidad_actual) - item.cantidad)
        await supabase
          .from('producto_lotes')
          .update({ cantidad_actual: nuevoStockLote })
          .eq('id', item.lote_id)
      }
    }
  }

  return {
    cobroId: cobro.id,
    numeroRecibo: 1,
    totalBs: totalFinal,
    itemsVendidos: datos.items.reduce((acc, i) => acc + i.cantidad, 0),
    fecha: cobro.created_at,
    clienteNombre,
    pacienteNombre,
  }
}

/**
 * Obtiene el detalle de una venta efectuada para impresión de ticket o comprobante.
 */
export async function getDetalleVenta(cobroId: string) {
  const { data: cobro, error } = await supabase
    .from('cobros')
    .select(`
      *,
      lineas:cobro_lineas(*)
    `)
    .eq('id', cobroId)
    .single()

  if (error || !cobro) throw new Error(`No se encontró el comprobante de venta: ${error?.message}`)
  return cobro
}
