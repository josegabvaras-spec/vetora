import { supabase } from '../lib/supabase'
import type { Cita, EstadoCita, TipoCita } from '../types/database'
import type { CitaConDetalle, ConsultaOrigen } from '../types/views'
import { citaQueOcupa } from '../lib/agenda'
import { requiereConsultaOrigen, requiereProcedimiento, TIPO_LABEL } from '../lib/citas'

/**
 * Consulta de la que una reconsulta es seguimiento, con el motivo que quedó
 * registrado en su historial (o las notas de la cita, si aún no hay historial).
 */
export async function consultaOrigenDe(cita: Cita): Promise<ConsultaOrigen | null> {
  if (!cita.cita_origen_id) return null
  const { data: origen } = await supabase.from('citas').select('*').eq('id', cita.cita_origen_id).single()
  if (!origen) return null
  const { data: historial } = await supabase.from('historial_clinico').select('*').eq('cita_id', origen.id).maybeSingle()
  return {
    cita_id: origen.id,
    fecha_hora: origen.fecha_hora,
    motivo: historial?.motivo || origen.notas?.trim() || (TIPO_LABEL as any)[origen.tipo_cita],
  }
}

export async function listCitas(sucursalId?: string): Promise<CitaConDetalle[]> {
  let query = supabase.from('citas').select('*')
  if (sucursalId) query = query.eq('sucursal_id', sucursalId)
  
  const { data: citas } = await query
  if (!citas || citas.length === 0) return []

  // Traer todo de una para no hacer N+1 queries al resolver detalles
  const { data: pacientes } = await supabase.from('pacientes').select('*')
  const { data: clientes } = await supabase.from('clientes').select('*')
  const { data: usuarios } = await supabase.from('usuarios').select('*')
  const { data: servicios } = await supabase.from('servicios').select('*')
  const { data: consentimientos } = await supabase.from('consentimientos_cirugia').select('*')
  const { data: historiales } = await supabase.from('historial_clinico').select('*')
  const { data: internaciones } = await supabase.from('internaciones').select('*')

  const result = await Promise.all(citas.map(async (c: any) => {
    const paciente = pacientes?.find((p) => p.id === c.paciente_id)!
    const cliente = clientes?.find((cl) => cl.id === paciente?.cliente_id)!
    return {
      ...c,
      paciente: { ...paciente, cliente },
      veterinario_nombre: usuarios?.find((u) => u.id === c.veterinario_id)?.nombre ?? 'Veterinario',
      consentimiento: consentimientos?.find((con) => con.cita_id === c.id) ?? null,
      historial_id: historiales?.find((h) => h.cita_id === c.id)?.id ?? null,
      servicio_nombre: servicios?.find((s) => s.id === c.servicio_id)?.nombre ?? null,
      origen: await consultaOrigenDe(c),
      internacion_id: internaciones?.find((i) => i.cita_id === c.id)?.id ?? null,
    } as CitaConDetalle
  }))

  return result.sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))
}

/**
 * Consultas previas del paciente que pueden controlarse con una reconsulta:
 * las ya atendidas, de la más reciente a la más antigua.
 */
export async function consultasControlables(pacienteId: string): Promise<ConsultaOrigen[]> {
  const { data: citas } = await supabase
    .from('citas')
    .select('*')
    .eq('paciente_id', pacienteId)
    .neq('tipo_cita', 'reconsulta')
    .eq('estado', 'completada')
    .order('fecha_hora', { ascending: false })

  if (!citas) return []

  const { data: historiales } = await supabase.from('historial_clinico').select('*').eq('paciente_id', pacienteId)

  return citas.map((c: any) => ({
    cita_id: c.id,
    fecha_hora: c.fecha_hora,
    motivo: historiales?.find((h) => h.cita_id === c.id)?.motivo || c.notas?.trim() || (TIPO_LABEL as any)[c.tipo_cita],
  }))
}

export async function getCita(citaId: string): Promise<CitaConDetalle | null> {
  const citas = await listCitas()
  return citas.find((c) => c.id === citaId) ?? null
}

export interface NuevaCitaInput {
  pacienteId: string
  veterinarioId: string
  sucursalId: string
  fechaHoraIso: string
  tipoCita: TipoCita
  /** Obligatorio en reconsultas: la consulta previa que se controla. */
  citaOrigenId?: string | null
  /** Obligatorio en cirugías: qué procedimiento del catálogo se realiza. */
  servicioId?: string | null
  notas?: string
}

/**
 * Un veterinario no puede tener dos citas solapadas (bloques de 30 min), sin
 * importar la sucursal.
 */
export async function hayConflictoDeHorario(veterinarioId: string, fechaHoraIso: string): Promise<Cita | undefined> {
  const { data: citasDelVeterinario } = await supabase.from('citas').select('*').eq('veterinario_id', veterinarioId)
  return citaQueOcupa(fechaHoraIso, (citasDelVeterinario || []) as Cita[])
}

export async function crearCita(input: NuevaCitaInput): Promise<Cita> {
  if (await hayConflictoDeHorario(input.veterinarioId, input.fechaHoraIso)) {
    throw new Error('El veterinario ya tiene una cita en ese horario')
  }

  // Una reconsulta controla una consulta concreta, y del mismo paciente
  if (requiereConsultaOrigen(input.tipoCita)) {
    const { data: origen } = await supabase.from('citas').select('*').eq('id', input.citaOrigenId!).single()
    if (!origen) throw new Error('Indica de qué consulta es la reconsulta')
    if (origen.paciente_id !== input.pacienteId) {
      throw new Error('La consulta de origen es de otro paciente')
    }
  }

  if (requiereProcedimiento(input.tipoCita)) {
    const { data: servicio } = await supabase.from('servicios').select('*').eq('id', input.servicioId!).single()
    if (!servicio || servicio.categoria !== 'cirugia') {
      throw new Error('Indica qué cirugía se va a realizar')
    }
  }

  const { data, error } = await supabase
    .from('citas')
    .insert({
      sucursal_id: input.sucursalId,
      paciente_id: input.pacienteId,
      veterinario_id: input.veterinarioId,
      fecha_hora: input.fechaHoraIso,
      tipo_cita: input.tipoCita,
      estado: 'pendiente',
      cita_origen_id: requiereConsultaOrigen(input.tipoCita) ? input.citaOrigenId! : null,
      servicio_id: input.servicioId ?? null,
      notas: input.notas ?? null,
      recordatorio_enviado: false,
    })
    .select()
    .single()

  if (error || !data) throw new Error(`Error al crear cita: ${error?.message || 'desconocido'}`)
  return data as Cita
}

export async function actualizarEstadoCita(citaId: string, estado: EstadoCita): Promise<void> {
  const { error } = await supabase.from('citas').update({ estado }).eq('id', citaId)
  if (error) throw new Error(`Error al actualizar estado de la cita: ${error.message}`)
}
