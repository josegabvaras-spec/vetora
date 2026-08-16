import { db, newId } from '../mocks/db'
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

function delay<T>(value: T): Promise<T> {
  return Promise.resolve(value)
}

/** Lanza si el historial no existe o ya fue cerrado (PRD HU-02). */
function exigirBorrador(historialId: string): HistorialClinico {
  const historial = db.get('historial_clinico').find((h) => h.id === historialId)
  if (!historial) throw new Error('Historial no encontrado')
  if (!historial.editable) {
    throw new Error('Este historial está cerrado y ya no puede modificarse')
  }
  return historial
}

/**
 * Abre (o recupera) el historial clínico de una cita ya agendada. Es
 * idempotente: una cita tiene como mucho un historial, así que volver a
 * pulsar "Registrar historial" desde la Agenda no duplica el registro.
 */
export async function iniciarHistorialDesdeCita(citaId: string): Promise<HistorialClinico> {
  const existente = db.get('historial_clinico').find((h) => h.cita_id === citaId)
  if (existente) return delay(existente)

  const cita = db.get('citas').find((c) => c.id === citaId)
  if (!cita) throw new Error('Cita no encontrada')

  return crearBorradorHistorial({
    pacienteId: cita.paciente_id,
    citaId: cita.id,
    veterinarioId: cita.veterinario_id,
    motivo: motivoPorDefecto(cita),
    sintomas: '',
    diagnostico: '',
    tratamiento: '',
  })
}

const MOTIVO_POR_TIPO: Record<TipoCita, string> = {
  consulta: 'Consulta general',
  reconsulta: 'Reconsulta de control',
  vacuna: 'Aplicación de vacuna',
  desparasitacion: 'Desparasitación',
  cirugia: 'Procedimiento quirúrgico',
  peluqueria: 'Servicio de estética / peluquería',
}

/**
 * Motivo con el que se abre la ficha. Una reconsulta y una cirugía arrancan
 * nombrando lo concreto —qué se controla, qué se opera— en vez de la etiqueta
 * genérica del tipo de cita.
 */
function motivoPorDefecto(cita: Cita): string {
  if (cita.tipo_cita === 'reconsulta') {
    const origen = consultaOrigenDe(cita)
    return origen ? `Reconsulta: ${origen.motivo}` : MOTIVO_POR_TIPO.reconsulta
  }
  if (cita.tipo_cita === 'cirugia' && cita.servicio_id) {
    const servicio = db.get('servicios').find((s) => s.id === cita.servicio_id)
    if (servicio) return servicio.nombre
  }
  return cita.notas?.trim() || MOTIVO_POR_TIPO[cita.tipo_cita] || 'Consulta'
}

/**
 * Abre una consulta directamente desde la ficha del paciente (sin partir de
 * una cita ya agendada, p. ej. un caso espontáneo). Se crea una cita
 * "consulta" de respaldo para mantener la integridad del esquema
 * (historial_clinico.cita_id es obligatorio), y a partir de ella el borrador
 * de historial editable.
 */
export async function iniciarConsultaLibre(
  pacienteId: string,
  sucursalId: string,
  veterinarioId: string,
  motivo: string,
): Promise<HistorialClinico> {
  const cita: Cita = {
    id: newId('cita'),
    clinica_id: db.clinicaActivaId(),
    sucursal_id: sucursalId,
    paciente_id: pacienteId,
    veterinario_id: veterinarioId,
    fecha_hora: new Date().toISOString(),
    tipo_cita: 'consulta',
    estado: 'completada',
    cita_origen_id: null,
    servicio_id: null,
    notas: null,
    recordatorio_enviado: true,
    created_at: new Date().toISOString(),
  }
  db.set('citas', [...db.get('citas'), cita])

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
  const historial: HistorialClinico = {
    id: newId('historial'),
    clinica_id: db.clinicaActivaId(),
    paciente_id: input.pacienteId,
    cita_id: input.citaId,
    veterinario_id: input.veterinarioId,
    motivo: input.motivo,
    sintomas: input.sintomas,
    diagnostico: input.diagnostico,
    tratamiento: input.tratamiento,
    peso_kg: null,
    temperatura_c: null,
    frecuencia_cardiaca: null,
    editable: true,
    created_at: new Date().toISOString(),
  }
  db.set('historial_clinico', [...db.get('historial_clinico'), historial])
  return delay(historial)
}

/** Campos clínicos editables mientras el historial es borrador. */
export type CamposEditablesHistorial = Partial<Omit<HistorialClinico, 'id' | 'clinica_id' | 'paciente_id' | 'cita_id' | 'veterinario_id' | 'editable' | 'created_at'>>

/** Actualiza un historial en borrador. Rechazado si ya fue cerrado (RLS lo bloquearía en Supabase real). */
export async function actualizarBorradorHistorial(
  id: string,
  cambios: CamposEditablesHistorial,
): Promise<void> {
  exigirBorrador(id)
  if (cambios.motivo !== undefined && !cambios.motivo.trim()) {
    throw new Error('El motivo de la consulta no puede quedar vacío')
  }
  db.set(
    'historial_clinico',
    db.get('historial_clinico').map((h) => (h.id === id ? { ...h, ...cambios } : h)),
  )
  return delay(undefined)
}

/** Registra una vacuna aplicada durante la consulta (solo mientras es borrador). */
export async function registrarVacuna(
  historialId: string,
  nombreVacuna: string,
  fechaRefuerzo: string | null,
): Promise<VacunaAplicada> {
  const historial = exigirBorrador(historialId)
  if (!nombreVacuna.trim()) throw new Error('Indica el nombre de la vacuna')

  const vacuna: VacunaAplicada = {
    id: newId('vacuna'),
    clinica_id: db.clinicaActivaId(),
    paciente_id: historial.paciente_id,
    historial_id: historialId,
    nombre_vacuna: nombreVacuna.trim(),
    fecha_aplicacion: new Date().toISOString().slice(0, 10),
    fecha_refuerzo: fechaRefuerzo || null,
    created_at: new Date().toISOString(),
  }
  db.set('vacunas_aplicadas', [...db.get('vacunas_aplicadas'), vacuna])
  return delay(vacuna)
}

/**
 * Registra una desparasitación aplicada durante la consulta. Misma barrera que
 * las vacunas: solo mientras el historial es borrador, y solo INSERT (el
 * expediente no se reescribe).
 */
export async function registrarDesparasitacion(
  historialId: string,
  producto: string,
  via: ViaDesparasitacion,
  fechaProxima: string | null,
): Promise<DesparasitacionAplicada> {
  const historial = exigirBorrador(historialId)
  if (!producto.trim()) throw new Error('Indica el producto antiparasitario')

  const desparasitacion: DesparasitacionAplicada = {
    id: newId('desparasitacion'),
    clinica_id: db.clinicaActivaId(),
    paciente_id: historial.paciente_id,
    historial_id: historialId,
    producto: producto.trim(),
    via,
    fecha_aplicacion: new Date().toISOString().slice(0, 10),
    fecha_proxima: fechaProxima || null,
    created_at: new Date().toISOString(),
  }
  db.set('desparasitaciones_aplicadas', [...db.get('desparasitaciones_aplicadas'), desparasitacion])
  return delay(desparasitacion)
}

/**
 * Descuenta del inventario un producto usado en la consulta y lo deja
 * asociado a la cita (PRD Épica 5). Reutiliza `registrarMovimiento`, que ya
 * aplica la regla "Stock insuficiente" de HU-03.
 */
export async function registrarProductoUsado(
  historialId: string,
  productoId: string,
  cantidad: number,
): Promise<void> {
  const historial = exigirBorrador(historialId)
  const producto = db.get('productos').find((p) => p.id === productoId)
  if (!producto) throw new Error('Producto no encontrado')

  await registrarMovimiento(productoId, 'egreso', cantidad, `Usado en consulta: ${historial.motivo}`, {
    citaId: historial.cita_id,
  })
}

/**
 * PRD HU-02: al finalizar, `editable` pasa a false de forma irreversible.
 * En Supabase esto lo garantiza la policy RLS de UPDATE (editable = true) más
 * el trigger `trg_historial_inmutable`; aquí replicamos la misma barrera.
 */
export async function finalizarHistorial(id: string): Promise<void> {
  const actual = db.get('historial_clinico').find((h) => h.id === id)
  if (!actual) throw new Error('Historial no encontrado')
  if (!actual.editable) {
    throw new Error('Este historial ya se encuentra cerrado')
  }
  if (!actual.diagnostico.trim() || !actual.tratamiento.trim()) {
    throw new Error('Completa diagnóstico y tratamiento antes de cerrar el historial')
  }
  db.set(
    'historial_clinico',
    db.get('historial_clinico').map((h) => (h.id === id ? { ...h, editable: false } : h)),
  )
  return delay(undefined)
}

export interface RecetaItemInput {
  medicamento: string
  dosis: string
  via: ViaAdministracion
  frecuencia: string
  duracion: string
  indicaciones?: string | null
}

/**
 * Agrega un ítem a la receta de una consulta en borrador.
 * La receta es parte del expediente clínico: no se edita, solo se inserta
 * mientras la consulta está abierta (editable = true).
 */
export async function registrarRecetaItem(
  historialId: string,
  input: RecetaItemInput,
): Promise<RecetaItem> {
  const historial = exigirBorrador(historialId)
  if (!input.medicamento.trim()) throw new Error('Indica el nombre del medicamento')
  if (!input.dosis.trim()) throw new Error('Indica la dosis')
  if (!input.frecuencia.trim()) throw new Error('Indica la frecuencia de administración')
  if (!input.duracion.trim()) throw new Error('Indica la duración del tratamiento')

  const item: RecetaItem = {
    id: newId('receta'),
    clinica_id: db.clinicaActivaId(),
    historial_id: historialId,
    paciente_id: historial.paciente_id,
    medicamento: input.medicamento.trim(),
    dosis: input.dosis.trim(),
    via: input.via,
    frecuencia: input.frecuencia.trim(),
    duracion: input.duracion.trim(),
    indicaciones: input.indicaciones?.trim() || null,
    created_at: new Date().toISOString(),
  }
  db.set('recetas', [...db.get('recetas'), item])
  return delay(item)
}

/**
 * Elimina un ítem de la receta de una consulta en borrador.
 * Solo disponible mientras el historial no ha sido cerrado.
 */
export async function eliminarRecetaItem(
  recetaItemId: string,
  historialId: string,
): Promise<void> {
  exigirBorrador(historialId)
  db.set(
    'recetas',
    db.get('recetas').filter((r) => r.id !== recetaItemId),
  )
  return delay(undefined)
}
