import { supabase } from '../lib/supabase'
import type { Cita, EstadoCita, TipoCita } from '../types/database'
import type { CitaConDetalle, ConsultaOrigen } from '../types/views'
import { citaQueOcupa, SLOT_MINUTOS } from '../lib/agenda'
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

/** Ventana de tiempo, en ISO. Ambos extremos inclusive. */
export interface RangoFechas {
  desde: string
  hasta: string
}

/** Ids únicos y no nulos de un campo, listos para un `.in(...)`. */
function idsDe<T>(filas: T[], campo: (fila: T) => string | null | undefined): string[] {
  return [...new Set(filas.map(campo).filter((v): v is string => !!v))]
}

/**
 * Compone el detalle de un lote de citas con una consulta por tabla
 * relacionada, **acotada a los ids que ese lote referencia**.
 *
 * Antes cada tabla se traía entera con `select('*')`. Eso evitaba el N+1, sí,
 * pero PostgREST corta en 1000 filas: en una clínica con muchos pacientes, los
 * que no entraban en el lote salían como "Paciente no disponible" sin que nada
 * fallara. Con `.in('id', ...)` se pide exactamente lo que hace falta.
 */
async function componerDetalleDeCitas(citas: any[]): Promise<CitaConDetalle[]> {
  if (citas.length === 0) return []

  const citaIds = idsDe(citas, (c) => c.id)
  const pacienteIds = idsDe(citas, (c) => c.paciente_id)
  const veterinarioIds = idsDe(citas, (c) => c.veterinario_id)
  const servicioIds = idsDe(citas, (c) => c.servicio_id)

  const [
    { data: pacientes },
    { data: usuarios },
    { data: servicios },
    { data: consentimientos },
    { data: historiales },
    { data: internaciones },
  ] = await Promise.all([
    supabase.from('pacientes').select('*').in('id', pacienteIds),
    supabase.from('usuarios').select('id, nombre').in('id', veterinarioIds),
    servicioIds.length
      ? supabase.from('servicios').select('id, nombre').in('id', servicioIds)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('consentimientos_cirugia').select('*').in('cita_id', citaIds),
    supabase.from('historial_clinico').select('id, cita_id').in('cita_id', citaIds),
    supabase.from('internaciones').select('id, cita_id').in('cita_id', citaIds),
  ])

  // Los dueños se resuelven a partir de los pacientes ya traídos.
  const clienteIds = idsDe(pacientes ?? [], (p: any) => p.cliente_id)
  const { data: clientes } = clienteIds.length
    ? await supabase.from('clientes').select('*').in('id', clienteIds)
    : { data: [] as any[] }

  const porId = <T extends { id: string }>(filas: T[] | null) =>
    new Map((filas ?? []).map((f) => [f.id, f]))
  const porCita = <T extends { cita_id: string | null }>(filas: T[] | null) =>
    new Map((filas ?? []).filter((f) => f.cita_id).map((f) => [f.cita_id as string, f]))

  const mapaPacientes = porId(pacientes as any[])
  const mapaClientes = porId(clientes as any[])
  const mapaUsuarios = porId(usuarios as any[])
  const mapaServicios = porId(servicios as any[])
  const mapaConsentimientos = porCita(consentimientos as any[])
  const mapaHistoriales = porCita(historiales as any[])
  const mapaInternaciones = porCita(internaciones as any[])

  const result = await Promise.all(
    citas.map(async (c: any) => {
      const paciente = mapaPacientes.get(c.paciente_id) ?? null
      const cliente = paciente ? mapaClientes.get((paciente as any).cliente_id) ?? null : null
      return {
        ...c,
        paciente: paciente
          ? { ...paciente, cliente }
          : { id: c.paciente_id, nombre: 'Paciente no disponible', cliente },
        veterinario_nombre: (mapaUsuarios.get(c.veterinario_id) as any)?.nombre ?? 'Veterinario',
        consentimiento: mapaConsentimientos.get(c.id) ?? null,
        historial_id: (mapaHistoriales.get(c.id) as any)?.id ?? null,
        servicio_nombre: (mapaServicios.get(c.servicio_id) as any)?.nombre ?? null,
        origen: await consultaOrigenDe(c),
        internacion_id: (mapaInternaciones.get(c.id) as any)?.id ?? null,
      } as CitaConDetalle
    }),
  )

  return result.sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))
}

/**
 * Citas de una sucursal, opcionalmente acotadas a una ventana de fechas y a un
 * veterinario.
 *
 * El `rango` no es opcional por comodidad: `citas` crece sin techo y sin él la
 * consulta se trunca a 1000 filas en silencio. La agenda sabe exactamente qué
 * días pinta, así que pasa esa ventana.
 *
 * `veterinarioId` es el tercer eje de filtrado, y como los otros dos **lo pasa
 * quien llama**: sin él no filtra. La agenda lo saca de `veterinarioAcotado()`
 * ([lib/personal.ts](../lib/personal.ts)) — para un `veterinario` es su propio
 * id, para admin y recepción es `undefined`.
 */
export async function listCitas(
  sucursalId?: string,
  rango?: RangoFechas,
  veterinarioId?: string,
): Promise<CitaConDetalle[]> {
  let query = supabase.from('citas').select('*')
  if (sucursalId) query = query.eq('sucursal_id', sucursalId)
  if (rango) query = query.gte('fecha_hora', rango.desde).lte('fecha_hora', rango.hasta)
  if (veterinarioId) query = query.eq('veterinario_id', veterinarioId)

  const { data: citas, error } = await query
  if (error) throw new Error(`No se pudo cargar la agenda: ${error.message}`)
  if (!citas || citas.length === 0) return []

  return componerDetalleDeCitas(citas)
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
  // Antes esto llamaba a `listCitas()` y buscaba en el resultado: reconstruía la
  // agenda entera —ocho consultas sobre tablas completas— para leer una fila. Y
  // si la cita quedaba por encima del corte de 1000, devolvía null como si no
  // existiera.
  const { data: cita, error } = await supabase.from('citas').select('*').eq('id', citaId).maybeSingle()
  if (error) throw new Error(`No se pudo cargar la cita: ${error.message}`)
  if (!cita) return null

  const [detalle] = await componerDetalleDeCitas([cita])
  return detalle ?? null
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
  // Solo puede solapar una cita que empiece dentro de un bloque a cada lado:
  // los bloques son de `SLOT_MINUTOS` y `citaQueOcupa` compara rangos de esa
  // duración. Traer todas las citas de por vida del veterinario era además
  // arriesgado: por encima de 1000 filas, PostgREST devolvía las primeras y el
  // conflicto podía no venir en el lote. La barrera dura sigue siendo el
  // EXCLUDE `citas_sin_solapamiento`; esto es el aviso temprano.
  const centro = new Date(fechaHoraIso).getTime()
  const margen = SLOT_MINUTOS * 60 * 1000

  const { data: citasDelVeterinario } = await supabase
    .from('citas')
    .select('*')
    .eq('veterinario_id', veterinarioId)
    .gte('fecha_hora', new Date(centro - margen).toISOString())
    .lte('fecha_hora', new Date(centro + margen).toISOString())

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
  // `citas_personal` exige admin o la sucursal propia. Sin `.select()`, marcar
  // como completada una cita de otra sucursal se pintaba en la interfaz sin
  // haber cambiado nada en la base.
  const { data, error } = await supabase
    .from('citas')
    .update({ estado })
    .eq('id', citaId)
    .select('id')

  if (error) throw new Error(`Error al actualizar estado de la cita: ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error('No tienes permiso para modificar esta cita')
  }
}
