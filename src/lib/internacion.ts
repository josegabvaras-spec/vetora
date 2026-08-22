import { clinicDayIso } from './datetime'
import type { EstadoInternacion } from '../types/database'

export const ESTADO_INTERNACION_LABEL: Record<EstadoInternacion, string> = {
  internado: 'Internado',
  alta: 'De alta',
}

export const ESTADO_INTERNACION_TONE: Record<EstadoInternacion, 'teal' | 'slate'> = {
  internado: 'teal',
  alta: 'slate',
}

const MS_POR_DIA = 24 * 60 * 60 * 1000

/**
 * Días de estadía que se facturan. Se cobra por **día iniciado**, que es como
 * se factura la hospitalización: un ingreso de 26 horas son 2 días, y una
 * estadía de pocas horas es 1 día. Nunca devuelve 0, para que una internación
 * registrada siempre tenga importe.
 *
 * `hasta` permite calcular el acumulado de una estadía en curso.
 */
export function diasDeEstadia(fechaIngreso: string, fechaAlta?: string | null, hasta = new Date()): number {
  const inicio = new Date(fechaIngreso).getTime()
  const fin = new Date(fechaAlta ?? hasta.toISOString()).getTime()
  if (!Number.isFinite(inicio) || !Number.isFinite(fin)) return 1
  return Math.max(1, Math.ceil(Math.max(0, fin - inicio) / MS_POR_DIA))
}

export function etiquetaDias(dias: number): string {
  return `${dias} ${dias === 1 ? 'día' : 'días'}`
}

/**
 * Si al paciente todavía no se le ha registrado la evolución de HOY.
 *
 * `notas` viene ordenada de la más reciente a la más antigua desde
 * `detalleDeInternacion`, así que basta con mirar la primera.
 *
 * La comparación es de días clínicos como cadena. Con `new Date()` del
 * navegador, una nota escrita a las 21:00 en Bolivia cae ya en el día siguiente
 * en UTC y el aviso reaparecería esa misma noche, como si nadie hubiera escrito
 * nada.
 */
export function faltaEvolucionDeHoy(notas: { created_at: string }[]): boolean {
  const ultima = notas[0]
  return !ultima || clinicDayIso(ultima.created_at) !== clinicDayIso()
}
