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

/**
 * Mes de negocio (`'yyyy-MM'`) de un instante, en la zona de la clínica.
 *
 * Comparar meses con `getMonth()` los resuelve en la zona del navegador: un
 * cobro del 31 de agosto a las 21:00 en Tarija es `2026-09-01T01:00Z` y desde
 * un equipo en UTC cae en septiembre. El cierre de mes se descuadra justo en
 * las horas de más caja.
 */
export function clinicMonth(dateIso: string): string {
  return formatInTimeZone(dateIso, TIMEZONE, 'yyyy-MM')
}

export function formatClinicTime(dateIso: string): string {
  return formatInTimeZone(dateIso, TIMEZONE, 'HH:mm')
}

/**
 * Día de negocio (`'yyyy-MM-dd'`) de un instante, en la zona de la clínica.
 *
 * Es lo que hay que escribir en una columna `date` y lo que hay que comparar
 * contra un `<input type="date">`. `new Date().toISOString().slice(0, 10)` da el
 * día **UTC**: a partir de las 20:00 en La Paz ya es el día siguiente, así que
 * una vacuna puesta por la tarde quedaba fechada mañana y la caja de la noche
 * caía en el informe del día equivocado.
 */
export function clinicDayIso(dateIso: string = new Date().toISOString()): string {
  return formatInTimeZone(dateIso, TIMEZONE, 'yyyy-MM-dd')
}

/**
 * Desplaza un mes `'yyyy-MM'` sin pasar por `Date`.
 *
 * `d.setMonth(d.getMonth() - 1)` sobre un día 31 desborda: el 31 de marzo da
 * "31 de febrero", que JS normaliza al 3 de marzo. Comparar meses así hacía que
 * el "mes anterior" saliera igual al actual a fin de marzo, mayo, julio,
 * octubre y diciembre, con sus totales a cero y un +100 % inventado encima.
 */
export function sumarMeses(mes: string, delta: number): string {
  const [anio, m] = mes.split('-').map(Number)
  const total = anio * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
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
