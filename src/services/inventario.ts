import { supabase } from '../lib/supabase'
import { dosisDesdeEnvases, dosisDisponible } from '../lib/inventario'
import type { Producto } from '../types/database'
import type { ProductoConMovimientos } from '../types/views'

export interface DatosProducto {
  sku: string
  nombre: string
  precio_bs: number
  presentacion: string
  composicion: string
  unidad_medida: string
  contenido_presentacion: number
  stock_minimo: number

  // Las cinco de abajo las añadió 0030 a `productos` PARA TODOS, no solo para
  // el petshop, y este servicio las ignoraba. Sin `costo_bs` la clínica no
  // podía saber su margen en ninguna pantalla, y sin `codigo_barras` no había
  // nada que escanear. Todas opcionales: el alta rápida de un fármaco sigue
  // siendo nombre, precio y presentación.
  /** Lo que costó comprarlo. NUNCA sale al portal del cliente ni al catálogo. */
  costo_bs?: number
  codigo_barras?: string
  /** Laboratorio o marca comercial. */
  marca?: string
  proveedor_id?: string | null
  /** Si se le llevan lotes con vencimiento (ver PanelLotes). */
  requiere_lote?: boolean
}

/**
 * Que el SKU esté libre en esa sucursal.
 *
 * Exportada porque el alta del petshop (`crearProductoPetshop`) no la hacía:
 * insertaba a pelo y el `unique (sucursal_id, sku)` reventaba con un **23505
 * crudo**, ilegible para quien está dando de alta un producto. Es la misma
 * comprobación, así que es la misma función.
 */
export async function exigirSkuLibre(sku: string, sucursalId: string, ignorarId?: string) {
  // Incluye los dados de baja a propósito: el unique (sucursal_id, sku) sigue
  // ocupado por ellos, así que sin esto el insert moriría con un 23505 crudo.
  let query = supabase
    .from('productos')
    .select('id, activo')
    .eq('sucursal_id', sucursalId)
    .ilike('sku', sku.trim())
  if (ignorarId) query = query.neq('id', ignorarId)

  const { data, error } = await query
  if (error) throw new Error(`No se pudo validar el SKU: ${error.message}`)
  if (data && data.length > 0) {
    throw new Error(
      data.some((p) => p.activo === false)
        ? 'Ese SKU pertenece a un producto dado de baja en esta sucursal'
        : 'Ya existe un producto con ese SKU en esta sucursal',
    )
  }
}

async function validarProducto(datos: DatosProducto, sucursalId: string, ignorarId?: string) {
  if (!datos.sku.trim()) throw new Error('El SKU es obligatorio')
  if (!datos.nombre.trim()) throw new Error('El nombre del producto es obligatorio')
  if (!Number.isFinite(datos.precio_bs) || datos.precio_bs < 0) {
    throw new Error('El precio debe ser un número mayor o igual a 0')
  }
  if (!Number.isFinite(datos.stock_minimo) || datos.stock_minimo < 0) {
    throw new Error('El stock mínimo no puede ser negativo')
  }
  if (!datos.unidad_medida.trim()) throw new Error('La unidad de medida es obligatoria')
  if (!Number.isFinite(datos.contenido_presentacion) || datos.contenido_presentacion <= 0) {
    throw new Error('El contenido de presentación debe ser mayor a 0')
  }

  await exigirSkuLibre(datos.sku, sucursalId, ignorarId)
}

/**
 * @param stockInicialEnvases Envases completos con los que arranca el producto
 *   (3 frascos, no 150 ml). Se convierte a la unidad de medida antes de crear
 *   el movimiento, porque desde 0013 el movimiento va en ml y es el trigger
 *   quien vuelve a dividir para dejar el stock en envases.
 */
export async function crearProducto(
  sucursalId: string,
  datos: DatosProducto,
  stockInicialEnvases: number,
): Promise<Producto> {
  await validarProducto(datos, sucursalId)
  if (!Number.isFinite(stockInicialEnvases) || stockInicialEnvases < 0) {
    throw new Error('El stock inicial no puede ser negativo')
  }

  const { data: producto, error } = await supabase
    .from('productos')
    .insert({
      sucursal_id: sucursalId,
      sku: datos.sku.trim(),
      nombre: datos.nombre.trim(),
      presentacion: datos.presentacion.trim(),
      composicion: datos.composicion.trim(),
      unidad_medida: datos.unidad_medida.trim(),
      contenido_presentacion: datos.contenido_presentacion,
      precio_bs: datos.precio_bs,
      // `stock_actual` NO se envía: la columna arranca en 0 y el movimiento de
      // abajo lo sube vía trg_aplicar_movimiento_inventario. Ponerlo aquí lo
      // contaba dos veces (un alta de 50 quedaba en 100), que es el mismo error
      // de doble contabilización que ya se corrigió en registrarMovimiento.
      stock_minimo: datos.stock_minimo,
      costo_bs: datos.costo_bs ?? 0,
      codigo_barras: datos.codigo_barras?.trim() || null,
      marca: datos.marca?.trim() || '',
      proveedor_id: datos.proveedor_id || null,
      requiere_lote: datos.requiere_lote ?? false,
    } as any)
    .select()
    .single()

  if (error || !producto) throw new Error(`Error al crear producto: ${error?.message || 'desconocido'}`)

  if (stockInicialEnvases > 0) {
    const dosisIniciales = dosisDesdeEnvases(stockInicialEnvases, datos.contenido_presentacion)
    await registrarMovimiento(producto.id, 'ingreso', dosisIniciales, 'Stock inicial del producto')
  }

  const { data: final } = await supabase.from('productos').select('*').eq('id', producto.id).single()
  return final as Producto
}

export async function actualizarProducto(id: string, datos: DatosProducto): Promise<void> {
  const { data: producto } = await supabase.from('productos').select('*').eq('id', id).single()
  if (!producto) throw new Error('Producto no encontrado')

  await validarProducto(datos, producto.sucursal_id, id)

  // `.select()` no es decorativo: cuando la RLS filtra la fila PostgREST
  // devuelve 204 con error null, así que sin esto un veterinario editando el
  // producto de otra sucursal veía "guardado" sin haberse guardado nada.
  const { data: actualizado, error } = await supabase
    .from('productos')
    .update({
      sku: datos.sku.trim(),
      nombre: datos.nombre.trim(),
      presentacion: datos.presentacion.trim(),
      composicion: datos.composicion.trim(),
      unidad_medida: datos.unidad_medida.trim(),
      contenido_presentacion: datos.contenido_presentacion,
      precio_bs: datos.precio_bs,
      stock_minimo: datos.stock_minimo,
      costo_bs: datos.costo_bs ?? 0,
      codigo_barras: datos.codigo_barras?.trim() || null,
      marca: datos.marca?.trim() || '',
      proveedor_id: datos.proveedor_id || null,
      requiere_lote: datos.requiere_lote ?? false,
    } as any)
    .eq('id', id)
    .select('id')

  if (error) throw new Error(`Error al actualizar producto: ${error.message}`)
  if (!actualizado || actualizado.length === 0) {
    throw new Error('No tienes permiso para modificar este producto')
  }
}

/**
 * Baja lógica, no borrado.
 *
 * Un DELETE real se llevaba por delante el kardex entero del producto
 * (`movimientos_inventario.producto_id` es `on delete cascade`), y encima
 * fallaba con un 23503 crudo en cuanto el producto se hubiera vendido alguna
 * vez, porque `cobro_lineas` lo referencia. Es el mismo motivo por el que el
 * catálogo de servicios se desactiva en vez de borrarse.
 */
export async function eliminarProducto(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('productos')
    .update({ activo: false } as any)
    .eq('id', id)
    .select('id')

  if (error) throw new Error(`Error al dar de baja el producto: ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error('No tienes permiso para dar de baja este producto')
  }
}

export async function listProductos(sucursalId?: string): Promise<ProductoConMovimientos[]> {
  // Los dados de baja no salen del catálogo, pero siguen resolviéndose por id
  // en el kardex y en los recibos antiguos.
  let query = supabase.from('productos').select('*').eq('activo', true).order('nombre')
  if (sucursalId) query = query.eq('sucursal_id', sucursalId)

  const { data: productos } = await query
  if (!productos) return []

  // Acotado a los productos que se van a pintar. Antes se traía
  // `movimientos_inventario` entera —la tabla que más crece de todas, una fila
  // por cada entrada y salida de stock— para quedarse con los movimientos de
  // este catálogo. Por encima de 1000 filas el kardex reciente desaparecía sin
  // ningún aviso.
  const productoIds = productos.map((p: Producto) => p.id)
  const { data: movimientos } = productoIds.length
    ? await supabase
        .from('movimientos_inventario')
        .select('*')
        .in('producto_id', productoIds)
        .order('created_at', { ascending: false })
    : { data: [] as any[] }

  return productos.map((p: Producto) => ({
    ...p,
    movimientos: (movimientos?.filter((m) => m.producto_id === p.id) ?? []) as any,
  }))
}

export interface OrigenConsumo {
  citaId?: string | null
  internacionId?: string | null
  usuarioId?: string | null
}

export async function registrarMovimiento(
  productoId: string,
  tipo: any,
  cantidad: number,
  motivo: string,
  origen: OrigenConsumo = {},
): Promise<void> {
  if (cantidad <= 0) {
    throw new Error('La cantidad debe ser mayor a 0')
  }

  const { data: producto } = await supabase.from('productos').select('*').eq('id', productoId).single()
  if (!producto) throw new Error('Producto no encontrado')

  // Aviso temprano para dar un mensaje decente; NO es la barrera. La de verdad
  // es `check (stock_actual >= 0)`, que sí resiste dos egresos simultáneos.
  //
  // La comparación va en la unidad de medida, no en envases: desde 0013
  // `cantidad` son mililitros y `stock_actual` son frascos, así que compararlos
  // en crudo decía "stock insuficiente" en cuanto se pedían más de 3 ml de un
  // producto del que quedaban 3 frascos.
  if (tipo === 'egreso' && cantidad > dosisDisponible(producto)) {
    throw new Error('Stock insuficiente')
  }

  // El stock lo ajusta `trg_aplicar_movimiento_inventario` al insertar el
  // movimiento. Aplicarlo también aquí lo descontaba dos veces, y si el CHECK
  // abortaba el insert el ajuste manual ya estaba confirmado: stock movido sin
  // movimiento que lo respalde. El trigger es la única autoridad.
  const { error: insertError } = await supabase
    .from('movimientos_inventario')
    .insert({
      producto_id: productoId,
      tipo,
      cantidad,
      motivo,
      cita_id: origen.citaId ?? null,
      internacion_id: origen.internacionId ?? null,
      usuario_id: origen.usuarioId ?? null,
    } as any)

  if (insertError) {
    // 23514 = violación de CHECK: el egreso dejaría el stock bajo cero.
    if ((insertError as { code?: string }).code === '23514') {
      throw new Error('Stock insuficiente')
    }
    throw new Error(`Error al registrar movimiento: ${insertError.message}`)
  }
}
