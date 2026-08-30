import { supabase } from '../lib/supabase'
import { redimensionarImagen } from '../lib/imagen'
import { CATEGORIA_RETAIL_LABEL } from '../lib/retail'
import type { CatalogoProducto, CategoriaRetail, Producto } from '../types/database'
import type { ArticuloDeCatalogo } from '../types/views'

/**
 * Vitrina comercial de la clínica (migración 0027): lo que gestiona el admin
 * en `/catalogo` y lo que ve la Tienda del portal del cliente.
 *
 * Las fotos viven en el bucket PÚBLICO `catalogo` de Storage —a diferencia de
 * `estudios`/`comprobantes`, que son privados con URL firmada— porque esto
 * está pensado para mostrarse a cualquiera, cacheable, sin firmar cada hora.
 */

const BUCKET = 'catalogo'

export interface DatosCatalogoProducto {
  nombre: string
  descripcion: string
  categoria: string
  precio_bs: number
}

function validar(datos: DatosCatalogoProducto): void {
  if (!datos.nombre.trim()) throw new Error('El nombre del producto no puede quedar vacío')
  if (!Number.isFinite(datos.precio_bs) || datos.precio_bs < 0) {
    throw new Error('El precio debe ser un número mayor o igual a 0')
  }
}

/**
 * Lo que pinta `/catalogo`: **el inventario**, con una marca por cada artículo
 * que ya se está vendiendo en la Tienda.
 *
 * El catálogo era una lista aparte donde el admin volvía a escribir productos
 * que ya tenía cargados en el POS. Ahora parte del kardex y lo único que se
 * decide ahí es *cuáles* se muestran.
 *
 * `sueltos` son las fichas sin `producto_id`: las que se escribieron a mano
 * antes de 0033, y las de algo que se vende sin llevarle stock. No se pierden.
 *
 * No reusa `listProductos()` de `inventario.ts` a propósito: esa se trae
 * además `movimientos_inventario` de cada producto —la tabla que más crece— y
 * aquí no se pinta un solo movimiento.
 */
export async function listArticulosDeCatalogo(sucursalId?: string): Promise<{
  articulos: ArticuloDeCatalogo[]
  sueltos: CatalogoProducto[]
}> {
  let consulta = supabase.from('productos').select('*').eq('activo', true).order('nombre')
  if (sucursalId) consulta = consulta.eq('sucursal_id', sucursalId)

  const [{ data: productos, error }, fichas] = await Promise.all([consulta, listCatalogo()])
  if (error) throw new Error(`No se pudo cargar el inventario: ${error.message}`)

  const porProducto = new Map(
    fichas.filter((f) => f.producto_id).map((f) => [f.producto_id as string, f]),
  )

  return {
    articulos: ((productos ?? []) as Producto[]).map((producto) => ({
      producto,
      ficha: porProducto.get(producto.id) ?? null,
    })),
    sueltos: fichas.filter((f) => !f.producto_id),
  }
}

export async function listCatalogo(): Promise<CatalogoProducto[]> {
  const { data, error } = await supabase
    .from('catalogo_productos')
    .select('*')
    .order('nombre')

  if (error) throw new Error(`No se pudo cargar el catálogo: ${error.message}`)
  return (data ?? []) as CatalogoProducto[]
}

/** URL pública y permanente de la foto — pura, no hace ninguna llamada de red. */
export function urlFotoCatalogo(ruta: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl
}

async function subirFoto(clinicaId: string, archivo: File): Promise<string> {
  if (!archivo.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen')

  const comprimida = await redimensionarImagen(archivo)
  // La clínica va primera en la ruta: es lo que las policies de
  // `storage.objects` miran para aislar inquilinos.
  const ruta = `${clinicaId}/${crypto.randomUUID()}.jpg`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(ruta, comprimida, { contentType: 'image/jpeg', upsert: false })

  if (error) throw new Error(`No se pudo subir la foto: ${error.message}`)
  return ruta
}

export async function crearProductoCatalogo(
  clinicaId: string,
  datos: DatosCatalogoProducto,
  foto: File | null,
): Promise<CatalogoProducto> {
  validar(datos)

  const foto_ruta = foto ? await subirFoto(clinicaId, foto) : null

  const { data, error } = await supabase
    .from('catalogo_productos')
    .insert({
      nombre: datos.nombre.trim(),
      descripcion: datos.descripcion.trim(),
      categoria: datos.categoria.trim(),
      precio_bs: datos.precio_bs,
      foto_ruta,
    })
    .select()
    .single()

  if (error || !data) {
    // La foto ya está subida pero nada la referencia: sin este borrado
    // quedaría ocupando cuota para siempre, invisible desde la aplicación.
    if (foto_ruta) await supabase.storage.from(BUCKET).remove([foto_ruta])
    throw new Error(`No se pudo crear el producto: ${error?.message ?? 'desconocido'}`)
  }

  return data as CatalogoProducto
}

/**
 * Publica en la Tienda un producto que ya está en el kardex (migración 0033).
 *
 * `catalogo_productos` y `productos` siguen siendo dos tablas distintas —0027
 * lo argumenta largo y no se fusionan—, pero un petshop con 200 SKUs no va a
 * teclearlos dos veces. Esto copia lo que es público y **nada más**: nombre,
 * categoría y precio de VENTA. El costo, el stock, el sku y los lotes no
 * salen de aquí.
 *
 * Sin foto: `productos` no tiene ninguna. Se le añade después desde
 * `/catalogo`, que es donde vive el resto de la vitrina.
 *
 * El precio se mantiene solo a partir de aquí: `trg_sincronizar_precio_catalogo`
 * (0033) arrastra a esta ficha cualquier cambio del precio de venta, venga de
 * la pantalla que venga.
 *
 * Solo el `admin` puede llamarla — `catalogo_productos_admin` exige
 * `auth_es_admin()`. Quien pinte el botón tiene que comprobar el rol antes.
 */
export async function publicarProductoEnTienda(producto: Producto): Promise<CatalogoProducto> {
  // El mismo `|| 'otro'` con el que la pantalla de Productos pinta la columna:
  // la columna es nullable y un producto dado de alta antes de 0030 no la tiene.
  const categoria = CATEGORIA_RETAIL_LABEL[(producto.categoria_retail || 'otro') as CategoriaRetail]

  // La marca y la presentación son lo único con valor de escaparate que trae
  // el kardex («Royal Canin · Bolsa 15 kg»). El admin la reescribe en
  // `/catalogo` si quiere otra cosa.
  const descripcion = [producto.marca, producto.presentacion]
    .map((t) => (t ?? '').trim())
    .filter(Boolean)
    .join(' · ')

  const { data, error } = await supabase
    .from('catalogo_productos')
    .insert({
      nombre: producto.nombre.trim(),
      descripcion,
      categoria,
      precio_bs: producto.precio_bs,
      producto_id: producto.id,
      foto_ruta: null,
    })
    .select()
    .single()

  if (error || !data) {
    // El índice único de 0033 es lo que impide publicar dos veces el mismo
    // producto; se traduce, porque el mensaje de Postgres no le dice nada a
    // quien está mirando una lista de productos.
    if (error?.code === '23505') throw new Error('Este producto ya está publicado en la Tienda')
    throw new Error(`No se pudo publicar en la Tienda: ${error?.message ?? 'desconocido'}`)
  }

  return data as CatalogoProducto
}

export async function actualizarProductoCatalogo(id: string, datos: DatosCatalogoProducto): Promise<void> {
  validar(datos)
  const { data, error } = await supabase
    .from('catalogo_productos')
    .update({
      nombre: datos.nombre.trim(),
      descripcion: datos.descripcion.trim(),
      categoria: datos.categoria.trim(),
      precio_bs: datos.precio_bs,
    })
    .eq('id', id)
    .select('id')

  if (error) throw new Error(`No se pudo actualizar el producto: ${error.message}`)
  if (!data || data.length === 0) throw new Error('No tienes permiso para modificar el catálogo')
}

/**
 * Sube la foto nueva antes de borrar la vieja: si la subida falla, el
 * producto se queda con la foto que ya tenía en vez de sin ninguna.
 */
export async function reemplazarFotoProducto(producto: CatalogoProducto, foto: File): Promise<void> {
  const rutaNueva = await subirFoto(producto.clinica_id, foto)

  const { data, error } = await supabase
    .from('catalogo_productos')
    .update({ foto_ruta: rutaNueva })
    .eq('id', producto.id)
    .select('id')

  if (error || !data || data.length === 0) {
    await supabase.storage.from(BUCKET).remove([rutaNueva])
    throw new Error(error?.message ?? 'No tienes permiso para modificar el catálogo')
  }

  if (producto.foto_ruta) await supabase.storage.from(BUCKET).remove([producto.foto_ruta])
}

export async function quitarFotoProducto(producto: CatalogoProducto): Promise<void> {
  if (!producto.foto_ruta) return

  const { data, error } = await supabase
    .from('catalogo_productos')
    .update({ foto_ruta: null })
    .eq('id', producto.id)
    .select('id')

  if (error || !data || data.length === 0) {
    throw new Error(error?.message ?? 'No tienes permiso para modificar el catálogo')
  }

  await supabase.storage.from(BUCKET).remove([producto.foto_ruta])
}

/** Oculta o vuelve a mostrar el producto en la Tienda, sin borrarlo. */
export async function alternarDisponible(producto: CatalogoProducto): Promise<void> {
  const { data, error } = await supabase
    .from('catalogo_productos')
    .update({ disponible: !producto.disponible })
    .eq('id', producto.id)
    .select('id')

  if (error) throw new Error(`No se pudo cambiar el estado: ${error.message}`)
  if (!data || data.length === 0) throw new Error('No tienes permiso para modificar el catálogo')
}

/**
 * Borrado real de fila y foto — a diferencia de `servicios`, nada en el
 * esquema referencia esta tabla (no hay cobros ni citas atadas a un producto
 * de catálogo), así que no hace falta conservar el registro.
 */
export async function eliminarProductoCatalogo(producto: CatalogoProducto): Promise<void> {
  const { data, error } = await supabase
    .from('catalogo_productos')
    .delete()
    .eq('id', producto.id)
    .select('id')

  if (error) throw new Error(`No se pudo eliminar el producto: ${error.message}`)
  if (!data || data.length === 0) throw new Error('No tienes permiso para modificar el catálogo')

  if (producto.foto_ruta) await supabase.storage.from(BUCKET).remove([producto.foto_ruta])
}
