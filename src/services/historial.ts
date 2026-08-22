import { supabase } from '../lib/supabase'
import type {
  Cita,
  HistorialClinico,
  RecetaItem,
  TipoCita,
  ViaAdministracion,
} from '../types/database'
import type { ConsultaAbierta } from '../types/views'
import { clinicDayIso } from '../lib/datetime'
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

  if (error || !cita) {
    // 23P01 = violación del EXCLUDE `citas_sin_solapamiento`: el veterinario ya
    // tiene una cita en el bloque de 30 minutos que cubre este instante. Pasa
    // de verdad al atender sin cita a alguien que llega mientras hay otra
    // consulta en curso, y el mensaje crudo de Postgres no dice qué hacer.
    if ((error as { code?: string } | null)?.code === '23P01') {
      throw new Error(
        'Ese veterinario ya tiene una cita en este horario. Registra la consulta desde esa cita, o elige a otro veterinario.',
      )
    }
    throw new Error(`Error al crear cita de respaldo: ${error?.message || 'desconocido'}`)
  }

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

  // `.select()` obligatorio: si la RLS filtra la fila (otra pestaña cerró la
  // consulta mientras se escribía), PostgREST devuelve 204 con error null y el
  // diagnóstico tecleado se perdía en silencio mostrando "guardado".
  const { data, error } = await supabase
    .from('historial_clinico')
    .update(cambios)
    .eq('id', id)
    .select('id')

  if (error) throw new Error(`Error al actualizar historial: ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error('No se pudo guardar: la consulta ya fue cerrada o no tienes permiso')
  }
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

  const { data, error } = await supabase
    .from('historial_clinico')
    .update({ editable: false })
    .eq('id', id)
    .select('id')

  if (error) throw new Error(`Error al finalizar historial: ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error('No se pudo cerrar la consulta: ya fue cerrada o no tienes permiso')
  }
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

/**
 * Tope de la barrida de borradores.
 *
 * Una consulta abierta es, por definición, trabajo del día: si hay más de
 * doscientas sin cerrar, el problema no es la consulta sino la clínica. El
 * límite es explícito para que no lo ponga en silencio el corte de 1000 filas
 * de PostgREST.
 */
const TOPE_BORRADORES = 200

/**
 * Consultas abiertas y sin cerrar, para el asistente del veterinario.
 *
 * Es lo único de esa pantalla que no se puede sacar de `listCitas`:
 * `CitaConDetalle.historial_id` dice que hay historial, pero no si sigue
 * abierto, y un borrador que recepción abrió ayer y nadie cerró tiene que
 * seguir apareciendo.
 *
 * `veterinarioId` y `sucursalId` son opcionales y los pasa quien llama, igual
 * que en el resto de servicios. Ojo: `historial_clinico` **no tiene**
 * `sucursal_id` (0001:185), así que la sucursal se resuelve por la cita.
 *
 * Se compone con `.in(...)` sobre los ids que aparecen, como
 * `componerDetalleDeCitas`: traerse `pacientes` o `clientes` enteros se rompe
 * en silencio al pasar de 1000 filas.
 */
export async function listConsultasAbiertas(
  veterinarioId?: string,
  sucursalId?: string,
): Promise<ConsultaAbierta[]> {
  let query = supabase
    .from('historial_clinico')
    .select('id, cita_id, paciente_id, motivo')
    .eq('editable', true)
    .order('created_at', { ascending: false })
    .limit(TOPE_BORRADORES)
  if (veterinarioId) query = query.eq('veterinario_id', veterinarioId)

  const { data: borradores, error } = await query
  if (error) throw new Error(`No se pudieron cargar las consultas abiertas: ${error.message}`)
  if (!borradores || borradores.length === 0) return []

  const [{ data: citas }, { data: pacientes }] = await Promise.all([
    supabase
      .from('citas')
      .select('id, sucursal_id, fecha_hora, tipo_cita')
      .in('id', borradores.map((b) => b.cita_id)),
    supabase
      .from('pacientes')
      .select('id, nombre, cliente_id')
      .in('id', borradores.map((b) => b.paciente_id)),
  ])

  const clienteIds = [...new Set((pacientes ?? []).map((p) => p.cliente_id))]
  const { data: clientes } = clienteIds.length
    ? await supabase.from('clientes').select('id, nombre').in('id', clienteIds)
    : { data: [] as { id: string; nombre: string }[] }

  const mapaCitas = new Map((citas ?? []).map((c) => [c.id, c]))
  const mapaPacientes = new Map((pacientes ?? []).map((p) => [p.id, p]))
  const mapaClientes = new Map((clientes ?? []).map((c) => [c.id, c]))
  const hoy = clinicDayIso()

  return borradores
    .flatMap((b) => {
      const cita = mapaCitas.get(b.cita_id)
      // Sin la cita no hay ni sucursal ni fecha que enseñar. `cita_id` es
      // `not null` con `on delete cascade`, así que esto solo ocurre si la
      // RLS la filtró — y entonces la consulta no es de quien está mirando.
      if (!cita) return []
      if (sucursalId && cita.sucursal_id !== sucursalId) return []

      const paciente = mapaPacientes.get(b.paciente_id)
      const cliente = paciente ? mapaClientes.get(paciente.cliente_id) : undefined
      const dia = clinicDayIso(cita.fecha_hora)

      return [{
        historial_id: b.id,
        paciente_id: b.paciente_id,
        paciente_nombre: paciente?.nombre ?? 'Paciente no disponible',
        cliente_nombre: cliente?.nombre ?? '',
        motivo: b.motivo,
        cita_id: cita.id,
        fecha_hora: cita.fecha_hora,
        tipo_cita: cita.tipo_cita as TipoCita,
        atrasada: dia < hoy,
      }]
    })
    // Lo más atrasado primero: es lo que lleva más tiempo esperando.
    .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))
}
