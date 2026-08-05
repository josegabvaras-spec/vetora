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
