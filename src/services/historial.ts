import { supabase } from '../lib/supabase'
import type {
  Cita,
  DesparasitacionAplicada,
  HistorialClinico,
  RecetaItem,
  TipoCita,
  VacunaAplicada,
  ViaAdministracion,
  ViaDesparasitacion,
} from '../types/database'
import { consultaOrigenDe } from './citas'
import { registrarMovimiento } from './inventario'

/** Lanza si el historial no existe o ya fue cerrado (PRD HU-02). */
async function exigirBorrador(historialId: string): Promise<HistorialClinico> {
  const { data: historial } = await supabase.from('historial_clinico').select('*').eq('id', historialId).single()
  if (!historial) throw new Error('Historial no encontrado')
  if (!historial.editable) {
    throw new Error('Este historial está cerrado y ya no puede modificarse')
  }
  return historial as HistorialClinico
}

const MOTIVO_POR_TIPO: Record<TipoCita, string> = {
  consulta: 'Consulta general',
  reconsulta: 'Reconsulta de control',
  vacuna: 'Aplicación de vacuna',
  desparasitacion: 'Desparasitación',
  cirugia: 'Procedimiento quirúrgico',
  peluqueria: 'Servicio de estética / peluquería',
}

async function motivoPorDefecto(cita: Cita): Promise<string> {
  if (cita.tipo_cita === 'reconsulta') {
    const origen = await consultaOrigenDe(cita)
    return origen ? `Reconsulta: ${origen.motivo}` : MOTIVO_POR_TIPO.reconsulta
  }
  if (cita.tipo_cita === 'cirugia' && cita.servicio_id) {
    const { data: servicio } = await supabase.from('servicios').select('*').eq('id', cita.servicio_id).single()
    if (servicio) return servicio.nombre
  }
  return cita.notas?.trim() || MOTIVO_POR_TIPO[cita.tipo_cita] || 'Consulta'
}

export async function iniciarHistorialDesdeCita(citaId: string): Promise<HistorialClinico> {
  const { data: existente } = await supabase.from('historial_clinico').select('*').eq('cita_id', citaId).maybeSingle()
  if (existente) return existente as HistorialClinico

  const { data: cita } = await supabase.from('citas').select('*').eq('id', citaId).single()
  if (!cita) throw new Error('Cita no encontrada')

  const motivo = await motivoPorDefecto(cita as Cita)

  return crearBorradorHistorial({
    pacienteId: cita.paciente_id,
    citaId: cita.id,
    veterinarioId: cita.veterinario_id,
    motivo,
    sintomas: '',
    diagnostico: '',
    tratamiento: '',
  })
}

export async function iniciarConsultaLibre(
  pacienteId: string,
  sucursalId: string,
  veterinarioId: string,
  motivo: string,
): Promise<HistorialClinico> {
  const { data: cita, error } = await supabase
    .from('citas')
    .insert({
      sucursal_id: sucursalId,
      paciente_id: pacienteId,
      veterinario_id: veterinarioId,
      fecha_hora: new Date().toISOString(),
      tipo_cita: 'consulta',
      estado: 'completada',
      recordatorio_enviado: true,
    })
    .select()
    .single()

  if (error || !cita) throw new Error(`Error al crear cita de respaldo: ${error?.message || 'desconocido'}`)

  return crearBorradorHistorial({
    pacienteId,
    citaId: cita.id,
    veterinarioId,
    motivo,
    sintomas: '',
    diagnostico: '',
    tratamiento: '',
  })
}

export interface NuevaConsultaInput {
  pacienteId: string
  citaId: string
  veterinarioId: string
  motivo: string
  sintomas: string
  diagnostico: string
  tratamiento: string
}

export async function crearBorradorHistorial(input: NuevaConsultaInput): Promise<HistorialClinico> {
  const { data, error } = await supabase
    .from('historial_clinico')
    .insert({
      paciente_id: input.pacienteId,
      cita_id: input.citaId,
      veterinario_id: input.veterinarioId,
      motivo: input.motivo,
      sintomas: input.sintomas,
      diagnostico: input.diagnostico,
      tratamiento: input.tratamiento,
      editable: true,
    })
    .select()
    .single()

  if (error || !data) throw new Error(`Error al crear historial: ${error?.message || 'desconocido'}`)
  return data as HistorialClinico
}

export type CamposEditablesHistorial = Partial<Omit<HistorialClinico, 'id' | 'clinica_id' | 'paciente_id' | 'cita_id' | 'veterinario_id' | 'editable' | 'created_at'>>

export async function actualizarBorradorHistorial(
  id: string,
  cambios: CamposEditablesHistorial,
): Promise<void> {
  await exigirBorrador(id)
  if (cambios.motivo !== undefined && !cambios.motivo.trim()) {
    throw new Error('El motivo de la consulta no puede quedar vacío')
  }

  const { error } = await supabase
    .from('historial_clinico')
    .update(cambios)
    .eq('id', id)

  if (error) throw new Error(`Error al actualizar historial: ${error.message}`)
}

export async function registrarVacuna(
  historialId: string,
  nombreVacuna: string,
  fechaRefuerzo: string | null,
): Promise<VacunaAplicada> {
  const historial = await exigirBorrador(historialId)
  if (!nombreVacuna.trim()) throw new Error('Indica el nombre de la vacuna')

  const { data, error } = await supabase
    .from('vacunas_aplicadas')
    .insert({
      paciente_id: historial.paciente_id,
      historial_id: historialId,
      nombre_vacuna: nombreVacuna.trim(),
      fecha_aplicacion: new Date().toISOString().slice(0, 10),
      fecha_refuerzo: fechaRefuerzo || null,
    })
    .select()
    .single()

  if (error || !data) throw new Error(`Error al registrar vacuna: ${error?.message || 'desconocido'}`)
  return data as VacunaAplicada
}

export async function registrarDesparasitacion(
  historialId: string,
  producto: string,
  via: ViaDesparasitacion,
  fechaProxima: string | null,
): Promise<DesparasitacionAplicada> {
  const historial = await exigirBorrador(historialId)
  if (!producto.trim()) throw new Error('Indica el producto antiparasitario')

  const { data, error } = await supabase
    .from('desparasitaciones_aplicadas')
    .insert({
      paciente_id: historial.paciente_id,
      historial_id: historialId,
      producto: producto.trim(),
      via,
      fecha_aplicacion: new Date().toISOString().slice(0, 10),
      fecha_proxima: fechaProxima || null,
    })
    .select()
    .single()

  if (error || !data) throw new Error(`Error al registrar desparasitación: ${error?.message || 'desconocido'}`)
  return data as DesparasitacionAplicada
}

export async function registrarProductoUsado(
  historialId: string,
  productoId: string,
  cantidad: number,
): Promise<void> {
  const historial = await exigirBorrador(historialId)
  const { data: producto } = await supabase.from('productos').select('*').eq('id', productoId).single()
  if (!producto) throw new Error('Producto no encontrado')

  await registrarMovimiento(productoId, 'egreso', cantidad, `Usado en consulta: ${historial.motivo}`, {
    citaId: historial.cita_id,
  })
}

export async function finalizarHistorial(id: string): Promise<void> {
  const { data: actual } = await supabase.from('historial_clinico').select('*').eq('id', id).single()
  if (!actual) throw new Error('Historial no encontrado')
  if (!actual.editable) {
    throw new Error('Este historial ya se encuentra cerrado')
  }
  if (!actual.diagnostico?.trim() || !actual.tratamiento?.trim()) {
    throw new Error('Completa diagnóstico y tratamiento antes de cerrar el historial')
  }

  const { error } = await supabase
    .from('historial_clinico')
    .update({ editable: false })
    .eq('id', id)

  if (error) throw new Error(`Error al finalizar historial: ${error.message}`)
}

export interface RecetaItemInput {
  medicamento: string
  dosis: string
  via: ViaAdministracion
  frecuencia: string
  duracion: string
  indicaciones?: string | null
}

export async function registrarRecetaItem(
  historialId: string,
  input: RecetaItemInput,
): Promise<RecetaItem> {
  const historial = await exigirBorrador(historialId)
  if (!input.medicamento.trim()) throw new Error('Indica el nombre del medicamento')
  if (!input.dosis.trim()) throw new Error('Indica la dosis')
  if (!input.frecuencia.trim()) throw new Error('Indica la frecuencia de administración')
  if (!input.duracion.trim()) throw new Error('Indica la duración del tratamiento')

  const { data, error } = await supabase
    .from('recetas')
    .insert({
      historial_id: historialId,
      paciente_id: historial.paciente_id,
      medicamento: input.medicamento.trim(),
      dosis: input.dosis.trim(),
      via: input.via,
      frecuencia: input.frecuencia.trim(),
      duracion: input.duracion.trim(),
      indicaciones: input.indicaciones?.trim() || null,
    })
    .select()
    .single()

  if (error || !data) throw new Error(`Error al registrar receta: ${error?.message || 'desconocido'}`)
  return data as RecetaItem
}

export async function eliminarRecetaItem(
  recetaItemId: string,
  historialId: string,
): Promise<void> {
  await exigirBorrador(historialId)
  const { error } = await supabase.from('recetas').delete().eq('id', recetaItemId)
  if (error) throw new Error(`Error al eliminar receta: ${error.message}`)
}
