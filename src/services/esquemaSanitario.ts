import { supabase } from '../lib/supabase'
import type { DesparasitacionAplicada, VacunaAplicada, ViaDesparasitacion } from '../types/database'

/**
 * Calendario sanitario del paciente: vacunas y desparasitaciones aplicadas, con
 * su próxima fecha.
 *
 * Vive fuera de la consulta a propósito (migración 0014). El carné de una
 * mascota no depende de que el día que se le puso una dosis alguien abriera un
 * historial: hay vacunas que llegan puestas de otra clínica, y hay visitas
 * rápidas que no generan consulta.
 *
 * Los avisos de refuerzo los sigue derivando `services/programados.ts` leyendo
 * estas mismas tablas por `paciente_id`; aquí no se guarda ningún "ya avisado".
 */

export interface DatosVacuna {
  nombre: string
  /** Día clínico (`yyyy-mm-dd`). Suele ser pasado: se carga lo que ya traía. */
  fechaAplicacion: string
  fechaRefuerzo?: string | null
}

export interface DatosDesparasitacion {
  producto: string
  via: ViaDesparasitacion
  fechaAplicacion: string
  fechaProxima?: string | null
}

function exigirTexto(valor: string, campo: string): string {
  const limpio = valor.trim()
  if (!limpio) throw new Error(`${campo} es obligatorio`)
  return limpio
}

/**
 * Lanza si la operación no tocó ninguna fila.
 *
 * PostgREST devuelve 204 sin error cuando la RLS filtra la fila, así que sin
 * esto corregir la vacuna de otra clínica informaría "hecho" sin haber cambiado
 * nada. Es la misma comprobación que hace `services/plataforma.ts`.
 */
function exigirFilaAfectada(filas: unknown[] | null, accion: string): void {
  if (!filas || filas.length === 0) {
    throw new Error(`No se pudo ${accion}: no tienes permiso o el registro ya no existe`)
  }
}

export async function listVacunas(pacienteId: string): Promise<VacunaAplicada[]> {
  const { data, error } = await supabase
    .from('vacunas_aplicadas')
    .select('*')
    .eq('paciente_id', pacienteId)
    .order('fecha_aplicacion', { ascending: false })

  if (error) throw new Error(`No se pudieron cargar las vacunas: ${error.message}`)
  return (data ?? []) as VacunaAplicada[]
}

export async function listDesparasitaciones(pacienteId: string): Promise<DesparasitacionAplicada[]> {
  const { data, error } = await supabase
    .from('desparasitaciones_aplicadas')
    .select('*')
    .eq('paciente_id', pacienteId)
    .order('fecha_aplicacion', { ascending: false })

  if (error) throw new Error(`No se pudieron cargar las desparasitaciones: ${error.message}`)
  return (data ?? []) as DesparasitacionAplicada[]
}

export async function registrarVacuna(pacienteId: string, datos: DatosVacuna): Promise<VacunaAplicada> {
  const { data, error } = await supabase
    .from('vacunas_aplicadas')
    .insert({
      paciente_id: pacienteId,
      // Sin consulta detrás: es el caso que 0014 vino a habilitar.
      historial_id: null,
      nombre_vacuna: exigirTexto(datos.nombre, 'El nombre de la vacuna'),
      fecha_aplicacion: datos.fechaAplicacion,
      fecha_refuerzo: datos.fechaRefuerzo || null,
    })
    .select()
    .single()

  if (error || !data) throw new Error(`No se pudo registrar la vacuna: ${error?.message ?? 'desconocido'}`)
  return data as VacunaAplicada
}

export async function actualizarVacuna(id: string, datos: DatosVacuna): Promise<void> {
  const { data, error } = await supabase
    .from('vacunas_aplicadas')
    .update({
      nombre_vacuna: exigirTexto(datos.nombre, 'El nombre de la vacuna'),
      fecha_aplicacion: datos.fechaAplicacion,
      fecha_refuerzo: datos.fechaRefuerzo || null,
    })
    .eq('id', id)
    .select('id')

  if (error) throw new Error(`No se pudo corregir la vacuna: ${error.message}`)
  exigirFilaAfectada(data, 'corregir la vacuna')
}

export async function eliminarVacuna(id: string): Promise<void> {
  const { data, error } = await supabase.from('vacunas_aplicadas').delete().eq('id', id).select('id')

  if (error) throw new Error(`No se pudo eliminar la vacuna: ${error.message}`)
  exigirFilaAfectada(data, 'eliminar la vacuna')
}

export async function registrarDesparasitacion(
  pacienteId: string,
  datos: DatosDesparasitacion,
): Promise<DesparasitacionAplicada> {
  const { data, error } = await supabase
    .from('desparasitaciones_aplicadas')
    .insert({
      paciente_id: pacienteId,
      historial_id: null,
      producto: exigirTexto(datos.producto, 'El antiparasitario'),
      via: datos.via,
      fecha_aplicacion: datos.fechaAplicacion,
      fecha_proxima: datos.fechaProxima || null,
    })
    .select()
    .single()

  if (error || !data) {
    throw new Error(`No se pudo registrar la desparasitación: ${error?.message ?? 'desconocido'}`)
  }
  return data as DesparasitacionAplicada
}

export async function actualizarDesparasitacion(id: string, datos: DatosDesparasitacion): Promise<void> {
  const { data, error } = await supabase
    .from('desparasitaciones_aplicadas')
    .update({
      producto: exigirTexto(datos.producto, 'El antiparasitario'),
      via: datos.via,
      fecha_aplicacion: datos.fechaAplicacion,
      fecha_proxima: datos.fechaProxima || null,
    })
    .eq('id', id)
    .select('id')

  if (error) throw new Error(`No se pudo corregir la desparasitación: ${error.message}`)
  exigirFilaAfectada(data, 'corregir la desparasitación')
}

export async function eliminarDesparasitacion(id: string): Promise<void> {
  const { data, error } = await supabase.from('desparasitaciones_aplicadas').delete().eq('id', id).select('id')

  if (error) throw new Error(`No se pudo eliminar la desparasitación: ${error.message}`)
  exigirFilaAfectada(data, 'eliminar la desparasitación')
}
