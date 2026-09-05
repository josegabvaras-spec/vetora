import { supabase } from '../lib/supabase'
import { dosisDesdeEnvases } from '../lib/inventario'
import { registrarMovimiento, exigirSkuLibre } from './inventario'
import type {
  Producto,
  ProductoLote,
  CategoriaRetail,
  PetshopConfiguracion,
  Proveedor,
} from '../types/database'
import type {
  ProductoConLotes,
  ProductoLoteConDetalle,
} from '../types/views'
import { differenceInDays, parseISO, isPast } from 'date-fns'

// Los rótulos viven en `lib/retail.ts` desde 0033: son datos puros, y
// `services/catalogo.ts` también los necesita para publicar en la Tienda con
// la categoría en español. Se re-exportan porque las pantallas del petshop
// llevan tiempo pidiéndolos por aquí.
export { CATEGORIA_RETAIL_LABEL, CATEGORIAS_RETAIL } from '../lib/retail'

export interface FiltrosProductosPetshop {
  sucursalId?: string
  categoriaRetail?: CategoriaRetail
  busqueda?: string
  soloStockBajo?: boolean
  soloConLote?: boolean
  soloActivos?: boolean
}

/**
 * Lista productos con información de lotes, proveedor y stock.
 */
export async function listProductosPetshop(
  filtros: FiltrosProductosPetshop = {},
): Promise<ProductoConLotes[]> {
  /**
   * La consulta con los filtros que NO dependen de la búsqueda.
   *
   * Es una fábrica y no una variable porque un `PostgrestFilterBuilder` es
   * "thenable" de un solo uso: reutilizar el mismo objeto entre las cuatro
   * consultas de abajo no volvería a consultar.
   */
  const base = () => {
    let q = supabase
      .from('productos')
      .select(`
        *,
        proveedor:proveedores(*),
        lotes:producto_lotes(*)
      `)
      .order('nombre', { ascending: true })

    if (filtros.sucursalId) q = q.eq('sucursal_id', filtros.sucursalId)
    if (filtros.categoriaRetail) q = q.eq('categoria_retail', filtros.categoriaRetail)
    if (filtros.soloActivos !== false) q = q.eq('activo', true)
    return q
  }

  let data: any[] | null
  const termino = filtros.busqueda?.trim()

  if (!termino) {
    const resultado = await base()
    if (resultado.error) throw new Error(`Error al listar productos de pet shop: ${resultado.error.message}`)
    data = resultado.data
  } else {
    // ⚠️ **CUATRO consultas y una unión en memoria, nunca un `.or()` con el
    // término dentro.** Antes esto interpolaba la búsqueda en cuatro `ilike`
    // dentro de un `.or()`, que es el hallazgo H-1 de SEGURIDAD.md: ahí el
    // texto entra en la sintaxis de filtros de PostgREST, cuyos separadores
    // son la coma, el punto y los paréntesis. Buscar un SKU con una coma
    // partía la expresión en condiciones que nadie pidió.
    //
    // `%` y `_` son comodines de LIKE: sin escaparlos, buscar "50%" lista de
    // más. Mismo escape que `listPacientes`.
    const patron = `%${termino.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

    const [porNombre, porSku, porCodigo, porMarca] = await Promise.all([
      base().ilike('nombre', patron),
      base().ilike('sku', patron),
      base().ilike('codigo_barras', patron),
      base().ilike('marca', patron),
    ])

    const errorBusqueda = porNombre.error ?? porSku.error ?? porCodigo.error ?? porMarca.error
    if (errorBusqueda) throw new Error(`Error al listar productos de pet shop: ${errorBusqueda.message}`)

    // Un producto puede casar por varios campos a la vez.
    const unicos = new Map<string, any>()
    for (const p of [
      ...(porNombre.data ?? []),
      ...(porSku.data ?? []),
      ...(porCodigo.data ?? []),
      ...(porMarca.data ?? []),
    ]) {
      unicos.set(p.id, p)
    }
    data = [...unicos.values()].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)))
  }

  const now = new Date()

  let productos = (data || []).map((p: any) => {
    const lotes: ProductoLote[] = p.lotes || []
    let lotesProximos = 0
    let lotesVencidos = 0

    for (const l of lotes) {
      if (l.cantidad_actual > 0) {
        const fechaVenc = parseISO(l.fecha_vencimiento)
        const dias = differenceInDays(fechaVenc, now)
        if (dias < 0) lotesVencidos++
        else if (dias <= 60) lotesProximos++
      }
    }

    return {
      ...p,
      lotes,
      lotes_proximos_vencer: lotesProximos,
      lotes_vencidos: lotesVencidos,
    } as ProductoConLotes
  })

  if (filtros.soloStockBajo) {
    productos = productos.filter((p) => Number(p.stock_actual) <= Number(p.stock_minimo))
  }

  if (filtros.soloConLote) {
    productos = productos.filter((p) => p.requiere_lote)
  }

  return productos
}

export interface DatosNuevoProductoPetshop {
  sku: string
  nombre: string
  categoriaRetail: CategoriaRetail
  marca?: string
  codigoBarras?: string
  ubicacion?: string
  presentacion: string
  composicion?: string
  unidadMedida: string
  contenidoPresentacion: number
  costoBs: number
  precioBs: number
  stockMinimo: number
  stockMaximo?: number
  proveedorId?: string
  requiereLote?: boolean
  stockInicial?: number
}

/**
 * Crea un producto con todas las propiedades de Retail / Pet Shop.
 */
export async function crearProductoPetshop(
  sucursalId: string,
  datos: DatosNuevoProductoPetshop,
): Promise<Producto> {
  if (!datos.sku.trim()) throw new Error('El SKU o código del producto es obligatorio')
  if (!datos.nombre.trim()) throw new Error('El nombre del producto es obligatorio')
  if (datos.precioBs < 0) throw new Error('El precio no puede ser negativo')
  if (datos.costoBs < 0) throw new Error('El costo no puede ser negativo')
  // Faltaba: sin esto el `unique (sucursal_id, sku)` reventaba con un 23505
  // crudo. Es la misma comprobación que ya hacía el alta de la clínica.
  await exigirSkuLibre(datos.sku, sucursalId)

  const { data: prod, error } = await supabase
    .from('productos')
    .insert({
      sucursal_id: sucursalId,
      sku: datos.sku.trim(),
      nombre: datos.nombre.trim(),
      categoria_retail: datos.categoriaRetail,
      marca: datos.marca?.trim() || '',
      codigo_barras: datos.codigoBarras?.trim() || null,
      ubicacion: datos.ubicacion?.trim() || '',
      presentacion: datos.presentacion?.trim() || 'Unidad',
      composicion: datos.composicion?.trim() || '',
      unidad_medida: datos.unidadMedida?.trim() || 'unidad',
      contenido_presentacion: datos.contenidoPresentacion || 1,
      costo_bs: datos.costoBs,
      precio_bs: datos.precioBs,
      stock_minimo: datos.stockMinimo,
      stock_maximo: datos.stockMaximo || 100,
      proveedor_id: datos.proveedorId || null,
      requiere_lote: datos.requiereLote || false,
      activo: true,
    } as any)
    .select()
    .single()

  if (error || !prod) throw new Error(`Error al crear producto: ${error?.message || 'desconocido'}`)

  if (datos.stockInicial && datos.stockInicial > 0) {
    const dosis = dosisDesdeEnvases(datos.stockInicial, datos.contenidoPresentacion || 1)
    await registrarMovimiento(prod.id, 'ingreso', dosis, 'Stock inicial Pet Shop')
  }

  return prod as unknown as Producto
}

/**
 * Actualiza los datos de un producto de Pet Shop.
 */
export async function actualizarProductoPetshop(
  id: string,
  datos: Partial<DatosNuevoProductoPetshop>,
): Promise<void> {
  const payload: any = {}
  if (datos.sku !== undefined) payload.sku = datos.sku.trim()
  if (datos.nombre !== undefined) payload.nombre = datos.nombre.trim()
  if (datos.categoriaRetail !== undefined) payload.categoria_retail = datos.categoriaRetail
  if (datos.marca !== undefined) payload.marca = datos.marca.trim()
  if (datos.codigoBarras !== undefined) payload.codigo_barras = datos.codigoBarras.trim() || null
  if (datos.ubicacion !== undefined) payload.ubicacion = datos.ubicacion.trim()
  if (datos.presentacion !== undefined) payload.presentacion = datos.presentacion.trim()
  if (datos.composicion !== undefined) payload.composicion = datos.composicion.trim()
  if (datos.unidadMedida !== undefined) payload.unidad_medida = datos.unidadMedida.trim()
  if (datos.contenidoPresentacion !== undefined) payload.contenido_presentacion = datos.contenidoPresentacion
  if (datos.costoBs !== undefined) payload.costo_bs = datos.costoBs
  if (datos.precioBs !== undefined) payload.precio_bs = datos.precioBs
  if (datos.stockMinimo !== undefined) payload.stock_minimo = datos.stockMinimo
  if (datos.stockMaximo !== undefined) payload.stock_maximo = datos.stockMaximo
  if (datos.proveedorId !== undefined) payload.proveedor_id = datos.proveedorId || null
  if (datos.requiereLote !== undefined) payload.requiere_lote = datos.requiereLote

  const { error } = await supabase.from('productos').update(payload).eq('id', id)
  if (error) throw new Error(`Error al actualizar producto: ${error.message}`)
}

/**
 * Listado de lotes con cálculo de días y semáforo de vencimiento.
 */
export async function listLotes(filtros: {
  sucursalId?: string
  productoId?: string
  estado?: 'normal' | 'proximo' | 'vencido' | 'todos'
  diasAlerta?: number
} = {}): Promise<ProductoLoteConDetalle[]> {
  let query = supabase
    .from('producto_lotes')
    .select(`
      *,
      producto:productos(*),
      proveedor:proveedores(*)
    `)
    .order('fecha_vencimiento', { ascending: true })

  if (filtros.sucursalId) query = query.eq('sucursal_id', filtros.sucursalId)
  if (filtros.productoId) query = query.eq('producto_id', filtros.productoId)

  const { data, error } = await query
  if (error) throw new Error(`Error al listar lotes: ${error.message}`)

  const now = new Date()
  const diasAlerta = filtros.diasAlerta || 60

  const lotesConDetalle: ProductoLoteConDetalle[] = (data || []).map((l: any) => {
    const fechaVenc = parseISO(l.fecha_vencimiento)
    const dias = differenceInDays(fechaVenc, now)
    let estadoVencimiento: 'normal' | 'proximo' | 'vencido' = 'normal'

    if (isPast(fechaVenc) || dias < 0) {
      estadoVencimiento = 'vencido'
    } else if (dias <= diasAlerta) {
      estadoVencimiento = 'proximo'
    }

    return {
      ...l,
      dias_para_vencer: dias,
      estado_vencimiento: estadoVencimiento,
    }
  })

  if (filtros.estado && filtros.estado !== 'todos') {
    return lotesConDetalle.filter((l) => l.estado_vencimiento === filtros.estado)
  }

  return lotesConDetalle
}

/**
 * Registra un nuevo lote de producto manualmente.
 */
export async function crearLote(datos: {
  sucursalId: string
  productoId: string
  numeroLote: string
  fechaVencimiento: string
  cantidad: number
  costoUnitarioBs?: number
  proveedorId?: string
}): Promise<ProductoLote> {
  const { data, error } = await supabase
    .from('producto_lotes')
    .insert({
      sucursal_id: datos.sucursalId,
      producto_id: datos.productoId,
      numero_lote: datos.numeroLote.trim(),
      fecha_vencimiento: datos.fechaVencimiento,
      cantidad_inicial: datos.cantidad,
      cantidad_actual: datos.cantidad,
      costo_unitario_bs: datos.costoUnitarioBs || 0,
      proveedor_id: datos.proveedorId || null,
    })
    .select()
    .single()

  if (error || !data) throw new Error(`Error al crear lote: ${error?.message || 'desconocido'}`)
  return data as unknown as ProductoLote
}

export interface SugerenciaReposicion {
  producto: Producto
  stockActual: number
  stockMinimo: number
  stockMaximo: number
  cantidadSugerida: number
  consumoPromedioSemanal: number
  proveedor?: Proveedor | null
  urgencia: 'alta' | 'media' | 'baja'
}

/**
 * Genera sugerencias de reposición basadas en stock y movimientos recientes.
 */
export async function getSugerenciasReposicion(sucursalId?: string): Promise<SugerenciaReposicion[]> {
  const productos = await listProductosPetshop({ sucursalId, soloActivos: true })
  const sugerencias: SugerenciaReposicion[] = []

  for (const p of productos) {
    const actual = Number(p.stock_actual) || 0
    const minimo = Number(p.stock_minimo) || 0
    const maximo = Number(p.stock_maximo) || (minimo * 3 || 10)

    if (actual <= minimo) {
      const cantidadPedir = Math.max(1, maximo - actual)
      const urgencia: 'alta' | 'media' | 'baja' = actual === 0 ? 'alta' : 'media'

      sugerencias.push({
        producto: p,
        stockActual: actual,
        stockMinimo: minimo,
        stockMaximo: maximo,
        cantidadSugerida: cantidadPedir,
        consumoPromedioSemanal: Math.max(1, Math.round(minimo / 2)),
        proveedor: p.proveedor,
        urgencia,
      })
    }
  }

  return sugerencias.sort((a, b) => {
    if (a.urgencia === 'alta' && b.urgencia !== 'alta') return -1
    if (b.urgencia === 'alta' && a.urgencia !== 'alta') return 1
    return a.stockActual - b.stockActual
  })
}

/**
 * Obtiene la configuración del Pet Shop para la clínica.
 */
export async function getConfiguracionPetshop(): Promise<PetshopConfiguracion> {
  const { data, error } = await supabase.from('petshop_configuracion').select('*').limit(1).maybeSingle()
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Error al obtener configuración de pet shop: ${error.message}`)
  }

  if (data) return data as unknown as PetshopConfiguracion

  return {
    id: '',
    clinica_id: '',
    dias_alerta_vencimiento: 60,
    permitir_venta_sin_stock: false,
    exigir_autorizacion_devolucion: true,
    impresion_ticket_automatica: false,
    mensaje_ticket_pie: 'Gracias por su compra en Pet Shop',
    created_at: new Date().toISOString(),
  }
}

/**
 * Guarda o actualiza la configuración de Pet Shop.
 */
export async function guardarConfiguracionPetshop(
  config: Partial<Omit<PetshopConfiguracion, 'id' | 'clinica_id' | 'created_at'>>,
): Promise<void> {
  const actual = await getConfiguracionPetshop()

  if (actual.id) {
    const { error } = await supabase
      .from('petshop_configuracion')
      .update({
        dias_alerta_vencimiento: config.dias_alerta_vencimiento ?? actual.dias_alerta_vencimiento,
        permitir_venta_sin_stock: config.permitir_venta_sin_stock ?? actual.permitir_venta_sin_stock,
        exigir_autorizacion_devolucion: config.exigir_autorizacion_devolucion ?? actual.exigir_autorizacion_devolucion,
        impresion_ticket_automatica: config.impresion_ticket_automatica ?? actual.impresion_ticket_automatica,
        mensaje_ticket_pie: config.mensaje_ticket_pie ?? actual.mensaje_ticket_pie,
      })
      .eq('id', actual.id)

    if (error) throw new Error(`Error al actualizar configuración: ${error.message}`)
  } else {
    const { error } = await supabase.from('petshop_configuracion').insert({
      dias_alerta_vencimiento: config.dias_alerta_vencimiento || 60,
      permitir_venta_sin_stock: config.permitir_venta_sin_stock || false,
      exigir_autorizacion_devolucion: config.exigir_autorizacion_devolucion ?? true,
      impresion_ticket_automatica: config.impresion_ticket_automatica || false,
      mensaje_ticket_pie: config.mensaje_ticket_pie || 'Gracias por su compra',
    })

    if (error) throw new Error(`Error al crear configuración: ${error.message}`)
  }
}
