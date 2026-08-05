import type { EstadoCita, TipoCita } from '../types/database'

// Etiquetas y tonos de las citas, en un solo lugar: los usan la Agenda y el
// modal de detalle, que antes los definían por separado.

export const TIPO_LABEL: Record<TipoCita, string> = {
  consulta: 'Consulta',
  reconsulta: 'Reconsulta',
  vacuna: 'Vacuna',
  desparasitacion: 'Desparasitación',
  cirugia: 'Cirugía',
}

export const TIPO_TONE: Record<TipoCita, 'slate' | 'teal' | 'amber' | 'rose'> = {
  consulta: 'slate',
  reconsulta: 'teal',
  vacuna: 'amber',
  desparasitacion: 'amber',
  cirugia: 'rose',
}

/** Orden en que se ofrecen los tipos al agendar. */
export const TIPOS_CITA: TipoCita[] = ['consulta', 'reconsulta', 'vacuna', 'desparasitacion', 'cirugia']

/**
 * Una reconsulta es el control de una consulta anterior: sin esa consulta de
 * origen no tiene sentido clínico, así que la agenda la exige.
 */
export function requiereConsultaOrigen(tipo: TipoCita): boolean {
  return tipo === 'reconsulta'
}

/** Una cirugía debe decir cuál: el consentimiento y el cobro nombran el procedimiento. */
export function requiereProcedimiento(tipo: TipoCita): boolean {
  return tipo === 'cirugia'
}

export const ESTADO_LABEL: Record<EstadoCita, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  completada: 'Completada',
  cancelada: 'Cancelada',
}

export const ESTADO_TONE: Record<EstadoCita, 'teal' | 'emerald' | 'rose' | 'slate'> = {
  pendiente: 'slate',
  confirmada: 'teal',
  completada: 'emerald',
  cancelada: 'rose',
}
