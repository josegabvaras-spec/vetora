import { supabase } from '../lib/supabase'
import type {
  EspecieVademecum,
  FichaVademecum,
  UnidadDosificacion,
  ViaAdministracion,
} from '../types/database'

/**
 * El vademécum propio de la clínica (migración 0042): sus medicamentos, con la
 * concentración y el rango de dosis que ella misma fija.
 *
 * Nació por un problema de datos, no por la IA: `recetas.medicamento` y
 * `recetas.dosis` son texto libre, así que «Amoxicilina», «Amoxi 500» y «amoxi
 * clavulánico» conviven como cosas distintas. De aquí sale la lista con la que
 * el recetario autocompleta, y de aquí sale también la fuente contra la que el
 * copiloto puede contrastar una dosis en vez de citar solo su entrenamiento.
 *
 * ⚠️ **Escribir es de `admin` y `veterinario`.** Lo aplica la RLS con
 * `auth_es_clinico()`; aquí solo se traduce el 403 a un mensaje legible, igual
 * que hace `registrarMovimiento` con «Stock insuficiente». Leerlo es de todo el
 * personal, peluquero incluido.
 */

export interface DatosVademecum {
  nombre: string
  principioActivo?: string
  presentacion?: string
  /** Miligramos de principio activo por UNA unidad de dosificación. */
  concentracionMg?: number | null
  unidadDosificacion?: UnidadDosificacion
  especie?: EspecieVademecum
  via?: ViaAdministracion
  dosisMinMgKg?: number | null
  dosisMaxMgKg?: number | null
  frecuencia?: string
  duracionHabitual?: string
  contraindicaciones?: string | null
  notas?: string | null
  activo?: boolean
}

function exigirTexto(valor: string | undefined, campo: string): string {
  const limpio = (valor ?? '').trim()
  if (!limpio) throw new Error(`${campo} es obligatorio`)
  return limpio
}

/**
 * Un rango al revés no es un dato a medias, es un dato erróneo: con
 * `min > max` ninguna dosis cae dentro y la comprobación del copiloto marcaría
 * todo como fuera de rango. El SQL lo impide igualmente
 * (`vademecum_rango_dosis`); esto es el aviso temprano, con el nombre del campo.
 */
function exigirRango(min: number | null | undefined, max: number | null | undefined): void {
  for (const [valor, campo] of [[min, 'La dosis mínima'], [max, 'La dosis máxima']] as const) {
    if (valor !== null && valor !== undefined && !(valor > 0)) {
      throw new Error(`${campo} tiene que ser mayor que cero`)
    }
  }
  if (min != null && max != null && max < min) {
    throw new Error('La dosis máxima no puede ser menor que la mínima')
  }
}

function exigirConcentracion(valor: number | null | undefined): void {
  if (valor !== null && valor !== undefined && !(valor > 0)) {
    throw new Error('La concentración tiene que ser mayor que cero')
  }
}

/**
 * PostgREST devuelve 204 sin error cuando la RLS filtra la fila, así que sin
 * esto editar la ficha de otra clínica —o hacerlo sin ser admin ni
 * veterinario— informaría «hecho» sin haber cambiado nada.
 */
function exigirFilaAfectada(filas: unknown[] | null, accion: string): void {
  if (!filas || filas.length === 0) {
    throw new Error(
      `No se pudo ${accion}: el vademécum solo lo edita un administrador o un veterinario, ` +
        'o la ficha ya no existe',
    )
  }
}

/** El `unique (clinica_id, lower(trim(nombre)), especie)` sale como 23505. */
function traducirDuplicado(mensaje: string): string {
  return mensaje.includes('vademecum_unico')
    ? 'Ya existe una ficha con ese nombre para esa especie'
    : mensaje
}

function aFila(d: DatosVademecum) {
  return {
    nombre: exigirTexto(d.nombre, 'El nombre del medicamento'),
    principio_activo: (d.principioActivo ?? '').trim(),
    presentacion: (d.presentacion ?? '').trim(),
    concentracion_mg: d.concentracionMg ?? null,
    unidad_dosificacion: d.unidadDosificacion ?? 'ml',
    especie: d.especie ?? 'todos',
    via: d.via ?? 'oral',
    dosis_min_mg_kg: d.dosisMinMgKg ?? null,
    dosis_max_mg_kg: d.dosisMaxMgKg ?? null,
    frecuencia: (d.frecuencia ?? '').trim(),
    duracion_habitual: (d.duracionHabitual ?? '').trim(),
    contraindicaciones: d.contraindicaciones?.trim() || null,
    notas: d.notas?.trim() || null,
    activo: d.activo ?? true,
  }
}

/**
 * Todo el vademécum de la clínica. Sin filtro por sucursal: la tabla es de
 * clínica, porque la dosis de un fármaco no cambia según la sede.
 */
export async function listVademecum(soloActivos = false): Promise<FichaVademecum[]> {
  let consulta = supabase.from('vademecum').select('*').order('nombre')
  if (soloActivos) consulta = consulta.eq('activo', true)

  const { data, error } = await consulta
  if (error) throw new Error(`No se pudo cargar el vademécum: ${error.message}`)
  return (data ?? []) as FichaVademecum[]
}

/**
 * Lo que necesita el recetario para autocompletar mientras se escribe.
 *
 * ⚠️ **Dos consultas y unión en memoria, nunca un `.or()` con el texto dentro.**
 * La coma y el paréntesis son sintaxis de filtro en PostgREST — es el hallazgo
 * H-1 de SEGURIDAD.md, y el mismo motivo por el que `buscar_paciente` está
 * escrita así en la Edge Function. Aquí el término viaja siempre como VALOR de
 * un `ilike`.
 */
export async function buscarEnVademecum(texto: string, limite = 10): Promise<FichaVademecum[]> {
  const termino = texto.trim()
  if (termino.length < 2) return []
  const patron = `%${termino}%`

  const [porNombre, porPrincipio] = await Promise.all([
    supabase.from('vademecum').select('*').eq('activo', true).ilike('nombre', patron).limit(limite),
    supabase.from('vademecum').select('*').eq('activo', true).ilike('principio_activo', patron).limit(limite),
  ])
  if (porNombre.error) throw new Error(`No se pudo buscar en el vademécum: ${porNombre.error.message}`)
  if (porPrincipio.error) throw new Error(`No se pudo buscar en el vademécum: ${porPrincipio.error.message}`)

  const unicos = new Map<string, FichaVademecum>()
  for (const f of [...(porNombre.data ?? []), ...(porPrincipio.data ?? [])] as FichaVademecum[]) {
    unicos.set(f.id, f)
  }
  return [...unicos.values()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .slice(0, limite)
}

export async function crearFichaVademecum(datos: DatosVademecum): Promise<FichaVademecum> {
  exigirRango(datos.dosisMinMgKg, datos.dosisMaxMgKg)
  exigirConcentracion(datos.concentracionMg)

  // `clinica_id` no se manda: lo pone `default auth_clinica_id()` en el SQL
  // (0042). Mandarlo desde el navegador sería fiarse del cliente para el
  // aislamiento, que es justo lo que la RLS existe para no tener que hacer.
  const { data, error } = await supabase.from('vademecum').insert(aFila(datos)).select().single()
  if (error) throw new Error(`No se pudo crear la ficha: ${traducirDuplicado(error.message)}`)
  return data as FichaVademecum
}

export async function actualizarFichaVademecum(
  id: string,
  datos: DatosVademecum,
): Promise<FichaVademecum> {
  exigirRango(datos.dosisMinMgKg, datos.dosisMaxMgKg)
  exigirConcentracion(datos.concentracionMg)

  const { data, error } = await supabase
    .from('vademecum')
    .update({ ...aFila(datos), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
  if (error) throw new Error(`No se pudo actualizar la ficha: ${traducirDuplicado(error.message)}`)
  exigirFilaAfectada(data, 'actualizar la ficha')
  return data![0] as FichaVademecum
}

export async function eliminarFichaVademecum(id: string): Promise<void> {
  const { data, error } = await supabase.from('vademecum').delete().eq('id', id).select()
  if (error) throw new Error(`No se pudo eliminar la ficha: ${error.message}`)
  exigirFilaAfectada(data, 'eliminar la ficha')
}
