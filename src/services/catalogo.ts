import { supabase } from '../lib/supabase'
import { redimensionarImagen } from '../lib/imagen'
import type { CatalogoProducto } from '../types/database'

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
