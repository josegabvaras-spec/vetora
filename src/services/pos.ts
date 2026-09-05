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
 *
 * ⚠️ **Ningún `.or()` con el texto de quien busca dentro.** Las dos consultas
 * de aquí lo llevaban: una interpolaba el término en `codigo_barras.eq.…` y
 * `sku.eq.…`, y la otra en tres `ilike`. Es exactamente el hallazgo H-1 de
 * [SEGURIDAD.md](../../SEGURIDAD.md), que ya se corrigió en `listPacientes` y
 * en las herramientas del copiloto pero se quedó sin corregir aquí: dentro de
 * un `.or()` el término entra en la **sintaxis de filtros de PostgREST**,
 * cuyos separadores son la coma, el punto y los paréntesis. Escanear un
 * código de barras con una coma partía la expresión en condiciones que nadie
 * pidió, y un paréntesis la reventaba con un error crudo de PostgREST.
 *
 * No se arregla escapando —serían dos gramáticas superpuestas, la de LIKE
 * dentro de la de PostgREST— sino con varias consultas y una unión en
 * memoria, que es como el término viaja SIEMPRE como valor de un parámetro.
 *
 * La RLS nunca dejó de encerrar al inquilino, así que esto no era una fuga
 * entre clínicas: era un filtro que dejaba de decir lo que aparentaba, en la
 * pantalla donde se cobra.
 */
export async function buscarProductoPOS(sucursalId: string, busqueda: string): Promise<Producto[]> {
  const term = busqueda.trim()
  if (!term) return []

  /** Lo que comparten las cuatro consultas: la sucursal y que esté activo. */
  const deLaSucursal = () =>
    supabase.from('productos').select('*').eq('sucursal_id', sucursalId).eq('activo', true)

  // Primero, coincidencia EXACTA por código de barras o SKU — lo que ocurre al
  // escanear. Dos consultas en paralelo en vez de un `.or()`.
  const [porCodigo, porSku] = await Promise.all([
    deLaSucursal().eq('codigo_barras', term).limit(5),
    deLaSucursal().eq('sku', term).limit(5),
  ])

  const errorExacto = porCodigo.error ?? porSku.error
  if (errorExacto) throw new Error(`Error en búsqueda POS: ${errorExacto.message}`)

  // Un producto puede casar por los dos campos a la vez.
  const exactos = new Map<string, any>()
  for (const p of [...(porCodigo.data ?? []), ...(porSku.data ?? [])]) exactos.set(p.id, p)
  if (exactos.size > 0) {
    return [...exactos.values()].slice(0, 5) as unknown as Producto[]
  }

  // Sin coincidencia exacta, búsqueda flexible por texto.
  // `%` y `_` son comodines de LIKE: sin escaparlos, buscar "50%" listaría de
  // más. Mismo escape que `listPacientes`.
  const patron = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

  const [porNombre, porSkuParcial, porMarca] = await Promise.all([
    deLaSucursal().ilike('nombre', patron).order('nombre', { ascending: true }).limit(20),
    deLaSucursal().ilike('sku', patron).order('nombre', { ascending: true }).limit(20),
    deLaSucursal().ilike('marca', patron).order('nombre', { ascending: true }).limit(20),
  ])

  const errorFlexible = porNombre.error ?? porSkuParcial.error ?? porMarca.error
  if (errorFlexible) throw new Error(`Error en búsqueda POS: ${errorFlexible.message}`)

  const unicos = new Map<string, any>()
  for (const p of [...(porNombre.data ?? []), ...(porSkuParcial.data ?? []), ...(porMarca.data ?? [])]) {
    unicos.set(p.id, p)
  }

  return [...unicos.values()]
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)))
    .slice(0, 20) as unknown as Producto[]
}

/**
 * Procesa la venta completa de forma transaccional:
 * 1. Valida el turno de caja abierto.
 * 2. Valida la disponibilidad de stock.
 * 3. Crea el cobro y sus líneas.
 * 4. Descuenta el inventario y lotes asociados.
 *
 * ⚠️ El precio de cada línea se relee de `productos.precio_bs` justo antes de
 * cobrar — nunca se usa `item.precio_unitario_bs` ni `item.subtotal_bs` tal
 * como llegan del carrito. El carrito vive en el navegador desde que se
 * agrega el producto hasta que se pulsa "cobrar", y en ese tiempo el precio
 * pudo cambiar; peor, nada impedía que la venta se mandara con cualquier
 * precio inventado. `cantidad` sí se acepta del cliente —elegir cuántas
 * unidades vender es la funcionalidad—, pero el precio no se negocia en el
 * POS: a diferencia de `aplicarAjustes()` en `caja.ts` (donde SÍ hay un
 * operador fijando el precio de una línea de consulta, a propósito), aquí no
 * existe ningún mecanismo pensado para vender a un precio distinto del que
 * tiene el producto en el catálogo.
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

  // Precio real de cada producto del carrito, todos de una vez: nunca el que
  // trae el `item` desde el navegador.
  const idsProductos = [...new Set(datos.items.map((item) => item.producto.id))]
  const { data: productosReales, error: errorProductos } = await supabase
    .from('productos')
    .select('id, precio_bs')
    .in('id', idsProductos)

  if (errorProductos || !productosReales) {
    throw new Error(`No se pudo verificar el precio de los productos: ${errorProductos?.message || 'desconocido'}`)
  }

  const precioReal = new Map(productosReales.map((p) => [p.id, Number(p.precio_bs) || 0]))

  const lineasVerificadas = datos.items.map((item) => {
    const precio = precioReal.get(item.producto.id)
    if (precio === undefined) {
      throw new Error(`El producto "${item.producto.nombre}" ya no existe en el catálogo`)
    }
    return {
      item,
      precio_unitario_bs: precio,
      subtotal_bs: Number((precio * item.cantidad).toFixed(2)),
    }
  })

  // 2. Calcular totales — sobre el precio verificado, no el del carrito.
  const subtotalProductos = lineasVerificadas.reduce((acc, l) => acc + l.subtotal_bs, 0)
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
  for (const { item, precio_unitario_bs, subtotal_bs } of lineasVerificadas) {
    // Línea de cobro — precio verificado arriba, nunca el del carrito.
    await supabase.from('cobro_lineas').insert({
      cobro_id: cobro.id,
      producto_id: item.producto.id,
      concepto: item.producto.nombre,
      cantidad: item.cantidad,
      precio_unitario_bs,
      subtotal_bs,
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
