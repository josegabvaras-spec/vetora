import { db, newId } from '../mocks/db'
import type { CategoriaServicio, Servicio } from '../types/database'

function delay<T>(value: T): Promise<T> {
  return Promise.resolve(value)
}

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
export function serviciosDeCategoria(categoria: CategoriaServicio): Servicio[] {
  return db
    .get('servicios')
    .filter((s) => s.activo && s.categoria === categoria)
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
}

export async function listServicios(soloActivos = false): Promise<Servicio[]> {
  const result = db
    .get('servicios')
    .filter((s) => !soloActivos || s.activo)
    .sort(
      (a, b) =>
        CATEGORIAS.indexOf(a.categoria) - CATEGORIAS.indexOf(b.categoria) || a.nombre.localeCompare(b.nombre),
    )
  return delay(result)
}

export interface DatosServicio {
  nombre: string
  categoria: CategoriaServicio
  precio_bs: number
}

function validar(datos: DatosServicio, ignorarId?: string) {
  if (!datos.nombre.trim()) throw new Error('El nombre del servicio no puede quedar vacío')
  if (!Number.isFinite(datos.precio_bs) || datos.precio_bs < 0) {
    throw new Error('El precio debe ser un número mayor o igual a 0')
  }
  const repetido = db
    .get('servicios')
    .some((s) => s.id !== ignorarId && s.nombre.trim().toLowerCase() === datos.nombre.trim().toLowerCase())
  if (repetido) throw new Error('Ya existe un servicio con ese nombre')
}

export async function crearServicio(datos: DatosServicio): Promise<Servicio> {
  validar(datos)
  const servicio: Servicio = {
    id: newId('servicio'),
    clinica_id: db.clinicaActivaId(),
    nombre: datos.nombre.trim(),
    categoria: datos.categoria,
    precio_bs: datos.precio_bs,
    activo: true,
    created_at: new Date().toISOString(),
  }
  db.set('servicios', [...db.get('servicios'), servicio])
  return delay(servicio)
}

export async function actualizarServicio(id: string, datos: DatosServicio): Promise<void> {
  if (!db.get('servicios').some((s) => s.id === id)) throw new Error('Servicio no encontrado')
  validar(datos, id)
  db.set(
    'servicios',
    db.get('servicios').map((s) =>
      s.id === id ? { ...s, nombre: datos.nombre.trim(), categoria: datos.categoria, precio_bs: datos.precio_bs } : s,
    ),
  )
  return delay(undefined)
}

/** Activa o desactiva el servicio; nunca se borra, para no romper cobros pasados. */
export async function alternarActivo(id: string): Promise<void> {
  db.set(
    'servicios',
    db.get('servicios').map((s) => (s.id === id ? { ...s, activo: !s.activo } : s)),
  )
  return delay(undefined)
}
