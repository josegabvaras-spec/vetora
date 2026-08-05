import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz'

// PRD §5.2: "Tiempos: Zona horaria estricta America/La_Paz" (siempre UTC-4, sin horario de verano).
export const TIMEZONE = 'America/La_Paz'

export function toClinicTime(dateIso: string): Date {
  return toZonedTime(dateIso, TIMEZONE)
}

/** Convierte una fecha/hora elegida en el formulario (hora local de la clínica) a TIMESTAMPTZ (UTC ISO). */
export function fromClinicTime(localDate: Date | string): string {
  return fromZonedTime(localDate, TIMEZONE).toISOString()
}

export function formatClinicDateTime(dateIso: string, pattern = "dd/MM/yyyy HH:mm"): string {
  return formatInTimeZone(dateIso, TIMEZONE, pattern)
}

export function formatClinicDate(dateIso: string): string {
  return formatInTimeZone(dateIso, TIMEZONE, 'dd/MM/yyyy')
}

export function formatClinicTime(dateIso: string): string {
  return formatInTimeZone(dateIso, TIMEZONE, 'HH:mm')
}

/**
 * Convierte una columna `date` de PostgreSQL ("2026-08-01") en un instante que
 * cae en ese mismo día aquí.
 *
 * Sin esto la fecha se lee como medianoche UTC, que en La Paz (UTC-4) es
 * todavía el día anterior: un refuerzo del día 1 aparecería como del 31. El
 * mediodía deja margen de sobra por los dos lados.
 */
export function desdeFechaSola(fecha: string): string {
  return `${fecha.slice(0, 10)}T12:00:00Z`
}
