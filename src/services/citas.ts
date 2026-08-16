import { db, newId } from '../mocks/db'
import type { Cita, EstadoCita, TipoCita } from '../types/database'
import type { CitaConDetalle, ConsultaOrigen } from '../types/views'
import { citaQueOcupa } from '../lib/agenda'
import { requiereConsultaOrigen, requiereProcedimiento, TIPO_LABEL } from '../lib/citas'

function delay<T>(value: T): Promise<T> {
  return Promise.resolve(value)
}

/**
 * Consulta de la que una reconsulta es seguimiento, con el motivo que quedó
 * registrado en su historial (o las notas de la cita, si aún no hay historial).
 */
export function consultaOrigenDe(cita: Cita): ConsultaOrigen | null {
  if (!cita.cita_origen_id) return null
  const origen = db.get('citas').find((c) => c.id === cita.cita_origen_id)
  if (!origen) return null
  const historial = db.get('historial_clinico').find((h) => h.cita_id === origen.id)
  return {
    cita_id: origen.id,
    fecha_hora: origen.fecha_hora,
    motivo: historial?.motivo || origen.notas?.trim() || TIPO_LABEL[origen.tipo_cita],
  }
}

export async function listCitas(sucursalId?: string): Promise<CitaConDetalle[]> {
  const citas = db.get('citas')
  const pacientes = db.get('pacientes')
  const clientes = db.get('clientes')
  const usuarios = db.get('usuarios')
  const servicios = db.get('servicios')
  const consentimientos = db.get('consentimientos_cirugia')
  const historiales = db.get('historial_clinico')
  const internaciones = db.get('internaciones')

  const result = citas
    .filter((c) => !sucursalId || c.sucursal_id === sucursalId)
    .map((c) => {
      const paciente = pacientes.find((p) => p.id === c.paciente_id)!
      const cliente = clientes.find((cl) => cl.id === paciente.cliente_id)!
      return {
        ...c,
        paciente: { ...paciente, cliente },
        veterinario_nombre: usuarios.find((u) => u.id === c.veterinario_id)?.nombre ?? 'Veterinario',
        consentimiento: consentimientos.find((con) => con.cita_id === c.id) ?? null,
        historial_id: historiales.find((h) => h.cita_id === c.id)?.id ?? null,
        servicio_nombre: servicios.find((s) => s.id === c.servicio_id)?.nombre ?? null,
        origen: consultaOrigenDe(c),
        internacion_id: internaciones.find((i) => i.cita_id === c.id)?.id ?? null,
      } satisfies CitaConDetalle
    })
    .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))

  return delay(result)
}


/**
 * Consultas previas del paciente que pueden controlarse con una reconsulta:
 * las ya atendidas, de la más reciente a la más antigua.
 */
export function consultasControlables(pacienteId: string): ConsultaOrigen[] {
  const historiales = db.get('historial_clinico')
  return db
    .get('citas')
    .filter((c) => c.paciente_id === pacienteId && c.tipo_cita !== 'reconsulta' && c.estado === 'completada')
    .map((c) => ({
      cita_id: c.id,
      fecha_hora: c.fecha_hora,
      motivo: historiales.find((h) => h.cita_id === c.id)?.motivo || c.notas?.trim() || TIPO_LABEL[c.tipo_cita],
    }))
    .sort((a, b) => b.fecha_hora.localeCompare(a.fecha_hora))
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
 * importar la sucursal. En Supabase lo garantiza la restricción EXCLUDE
 * `citas_sin_solapamiento`; aquí se replica la misma barrera.
 */
export function hayConflictoDeHorario(veterinarioId: string, fechaHoraIso: string): Cita | undefined {
  const citasDelVeterinario = db.get('citas').filter((c) => c.veterinario_id === veterinarioId)
  return citaQueOcupa(fechaHoraIso, citasDelVeterinario)
}

export async function crearCita(input: NuevaCitaInput): Promise<Cita> {
  if (hayConflictoDeHorario(input.veterinarioId, input.fechaHoraIso)) {
    throw new Error('El veterinario ya tiene una cita en ese horario')
  }

  // Una reconsulta controla una consulta concreta, y del mismo paciente: si no,
  // el seguimiento apuntaría a un expediente ajeno.
  if (requiereConsultaOrigen(input.tipoCita)) {
    const origen = db.get('citas').find((c) => c.id === input.citaOrigenId)
    if (!origen) throw new Error('Indica de qué consulta es la reconsulta')
    if (origen.paciente_id !== input.pacienteId) {
      throw new Error('La consulta de origen es de otro paciente')
    }
  }

  if (requiereProcedimiento(input.tipoCita)) {
    const servicio = db.get('servicios').find((s) => s.id === input.servicioId)
    if (!servicio || servicio.categoria !== 'cirugia') {
      throw new Error('Indica qué cirugía se va a realizar')
    }
  }

  const cita: Cita = {
    id: newId('cita'),
    clinica_id: db.clinicaActivaId(),
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
    created_at: new Date().toISOString(),
  }
  db.set('citas', [...db.get('citas'), cita])
  return delay(cita)
}

export async function actualizarEstadoCita(citaId: string, estado: EstadoCita): Promise<void> {
  db.set(
    'citas',
    db.get('citas').map((c) => (c.id === citaId ? { ...c, estado } : c)),
  )
  return delay(undefined)
}

// El recordatorio de cita (PRD Épica 4) vive en services/programados.ts:
// `avisoDeCita()` para componerlo y `enviarAviso()` para mandarlo y marcar la
// cita. Está allí porque un recordatorio de cita es un aviso más, junto a los
// refuerzos de vacuna y las desparasitaciones, y todos comparten la validación
// del tope mensual del plan.
