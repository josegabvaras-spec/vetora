// El turno abierto, el stock y los lotes ya no se tocan desde aquí: los
// resuelve `registrar_venta_pos()` dentro de su transacción (migración `0062`),
// que es también quien conoce la conversión de envases a unidad de medida de
// `0013`. Por eso ya no hacen falta `getTurnoAbierto`, `registrarMovimiento`
// ni `dosisDesdeEnvases`.
import { supabase } from '../lib/supabase'
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
  /**
   * Promoción que justifica el descuento. Antes viajaba aquí `codigoCupon`,
   * que el servicio **aceptaba y descartaba**: no había columna donde ponerlo,
   * así que se sabía cuánto se descontó pero no por qué. Desde `0060` la base
   * valida esta promoción (misma clínica, activa, en fecha, dentro de su
   * `limite_uso`) y comprueba que el importe no supere lo que puede dar.
   */
  promocionId?: string | null
  /** Obligatorio cuando hay descuento y NO hay promoción que lo respalde. */
  descuentoMotivo?: string
  notas?: string
  usuarioId?: string
  /**
   * Identifica el INTENTO de venta, no la venta. La genera la pantalla al
   * abrir el carrito —no al pulsar «cobrar»—, así que un doble clic o un
   * reintento de red traen la misma clave y la base rechaza el duplicado
   * (`cobros_idempotency_key_unica`, migración `0061`). Sin clave, el
   * comportamiento es el de siempre.
   */
  idempotencyKey?: string
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
 * Registra la venta del POS **en una sola transacción, en el servidor**.
 *
 * ⚠️ Esto era antes 3 + 3×N viajes desde el navegador, sin transacción: se
 * insertaba el cobro, y luego por cada ítem una línea, un movimiento de
 * inventario y un descuento de lote. El `insert` de `cobro_lineas`
 * **descartaba su error**, así que un fallo a mitad dejaba un cobro cobrado
 * sin ninguna línea que lo justificara; y si el egreso reventaba en el tercer
 * ítem, los dos primeros ya habían salido del inventario. Estados parciales
 * silenciosos, imposibles de detectar después.
 *
 * Ahora todo eso es `registrar_venta_pos()` (migración `0062`): o se escribe
 * la venta entera, o no se escribe nada.
 *
 * **Lo que este código ya NO decide**, porque lo resuelve el servidor:
 * el precio unitario, el subtotal, el total, el importe del descuento de una
 * promoción, la autoría del cobro y la clínica. De aquí solo sale **qué**
 * productos, **cuántas** unidades, qué promoción y el método de pago — que es
 * la funcionalidad, no la barrera.
 *
 * Mandar `precio_unitario_bs` en un ítem ya no sirve de nada: la función no lo
 * lee. Verificado contra producción — una venta con un precio falseado de
 * Bs. 1 se cobró al precio real del catálogo.
 */
export async function procesarVentaPOS(datos: DatosVentaPOS): Promise<ResultadoVentaPOS> {
  if (datos.items.length === 0) {
    throw new Error('El carrito de venta está vacío')
  }

  // Nombres para el comprobante. Es lo unico que se sigue resolviendo aqui:
  // son etiquetas del recibo, no importes ni permisos.
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

  // Del carrito solo viajan producto, cantidad y lote. Si alguien añade
  // `precio_unitario_bs` o `subtotal_bs` al objeto, la función no los lee.
  const { data, error } = await supabase.rpc('registrar_venta_pos', {
    p_sucursal_id: datos.sucursalId,
    p_items: datos.items.map((item) => ({
      producto_id: item.producto.id,
      cantidad: item.cantidad,
      lote_id: item.lote_id ?? null,
    })),
    p_metodo_pago: datos.metodoPago,
    p_cliente_nombre: clienteNombre,
    p_promocion_id: datos.promocionId ?? null,
    p_descuento_bs: datos.descuentoGlobalBs ?? 0,
    p_descuento_motivo: datos.descuentoMotivo?.trim() || null,
    p_idempotency_key: datos.idempotencyKey ?? null,
  })

  if (error) {
    // Los mensajes de la funcion ya estan escritos para leerse en pantalla
    // ("Stock insuficiente de X", "No hay un turno de caja abierto..."), asi
    // que se propagan tal cual en vez de envolverlos en otro texto.
    throw new Error(error.message || 'No se pudo registrar la venta')
  }

  const res = data as unknown as {
    cobro_id: string
    total_bs: number
    descuento_bs: number
    created_at: string
    reenvio: boolean
  }

  return {
    cobroId: res.cobro_id,
    numeroRecibo: 1,
    // El total que se ensena es el que calculo el SERVIDOR, no el de la
    // pantalla: si difieren, manda el que quedo registrado.
    totalBs: Number(res.total_bs),
    itemsVendidos: datos.items.reduce((acc, i) => acc + i.cantidad, 0),
    fecha: res.created_at,
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
