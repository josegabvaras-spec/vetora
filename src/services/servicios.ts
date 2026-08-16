import { supabase } from '../lib/supabase'
import type { CategoriaServicio, Servicio } from '../types/database'

export const CATEGORIA_LABEL: Record<CategoriaServicio, string> = {
  consulta: 'Consulta',
  cirugia: 'Cirugía',
  laboratorio: 'Laboratorio',
  imagenologia: 'Imagenología',
  internacion: 'Internación (por día)',
  peluqueria: 'Peluquería / Estética',
  otros: 'Otros',
}

/** Orden en que se muestran las categorías en el catálogo y en caja. */
export const CATEGORIAS: CategoriaServicio[] = [
  'consulta',
  'cirugia',
  'laboratorio',
  'imagenologia',
  'internacion',
  'peluqueria',
  'otros',
]

/** Servicios activos de una categoría, para los selectores de la agenda y la internación. */
export async function serviciosDeCategoria(categoria: CategoriaServicio): Promise<Servicio[]> {
  const { data, error } = await supabase
    .from('servicios')
    .select('*')
    .eq('activo', true)
    .eq('categoria', categoria)
    .order('nombre')
  
  if (error) throw new Error(`Error al cargar servicios: ${error.message}`)
  return data as Servicio[]
}

export async function listServicios(soloActivos = false): Promise<Servicio[]> {
  let query = supabase.from('servicios').select('*')
  if (soloActivos) query = query.eq('activo', true)
  
  const { data, error } = await query
  if (error) throw new Error(`Error al cargar servicios: ${error.message}`)

  // Ordenar en memoria por categoría (usando el array CATEGORIAS) y luego por nombre
  const resultados = (data as Servicio[]).sort(
    (a, b) =>
      CATEGORIAS.indexOf(a.categoria) - CATEGORIAS.indexOf(b.categoria) || a.nombre.localeCompare(b.nombre),
  )
  return resultados
}

export interface DatosServicio {
  nombre: string
  categoria: CategoriaServicio
  precio_bs: number
}

async function validar(datos: DatosServicio, ignorarId?: string) {
  if (!datos.nombre.trim()) throw new Error('El nombre del servicio no puede quedar vacío')
  if (!Number.isFinite(datos.precio_bs) || datos.precio_bs < 0) {
    throw new Error('El precio debe ser un número mayor o igual a 0')
  }

  let query = supabase.from('servicios').select('id').ilike('nombre', datos.nombre.trim())
  if (ignorarId) query = query.neq('id', ignorarId)
  
  const { data } = await query
  if (data && data.length > 0) throw new Error('Ya existe un servicio con ese nombre')
}

export async function crearServicio(datos: DatosServicio): Promise<Servicio> {
  await validar(datos)
  const { data, error } = await supabase
    .from('servicios')
    .insert({
      nombre: datos.nombre.trim(),
      categoria: datos.categoria,
      precio_bs: datos.precio_bs,
      activo: true,
    } as any)
    .select()
    .single()

  if (error || !data) throw new Error(`Error al crear servicio: ${error?.message || 'desconocido'}`)
  return data as Servicio
}

export async function actualizarServicio(id: string, datos: DatosServicio): Promise<void> {
  await validar(datos, id)
  const { error } = await supabase
    .from('servicios')
    .update({
      nombre: datos.nombre.trim(),
      categoria: datos.categoria,
      precio_bs: datos.precio_bs,
    })
    .eq('id', id)
    
  if (error) throw new Error(`Error al actualizar servicio: ${error.message}`)
}

/** Activa o desactiva el servicio; nunca se borra, para no romper cobros pasados. */
export async function alternarActivo(id: string): Promise<void> {
  const { data: servicio } = await supabase.from('servicios').select('activo').eq('id', id).single()
  if (!servicio) throw new Error('Servicio no encontrado')

  const { error } = await supabase
    .from('servicios')
    .update({ activo: !servicio.activo })
    .eq('id', id)

  if (error) throw new Error(`Error al cambiar estado: ${error.message}`)
}
