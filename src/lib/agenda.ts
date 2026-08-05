import type { Cita } from '../types/database'
import { fromClinicTime } from './datetime'

// Reglas de agendamiento del MVP: bloques fijos de 30 minutos dentro de un
// horario de atención partido. Toda hora se interpreta en America/La_Paz
// (ver src/lib/datetime.ts) y se persiste como TIMESTAMPTZ.

export const SLOT_MINUTOS = 30

export const HORARIO_ATENCION = [
  { nombre: 'Mañana', inicio: '08:30', fin: '12:30' },
  { nombre: 'Tarde', inicio: '14:30', fin: '19:00' },
] as const

export interface EspacioAgenda {
  /** Hora de inicio en formato 'HH:mm' (hora de la clínica). */
  hora: string
  /** Inicio del espacio como TIMESTAMPTZ ISO, listo para guardar. */
  inicioIso: string
  ocupado: boolean
  /** Cita que ocupa el espacio, para poder explicar el conflicto al usuario. */
  citaOcupante?: Cita
}

export interface BloqueEspacios {
  nombre: string
  espacios: EspacioAgenda[]
}

function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function aHora(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Horas de inicio de cada espacio del día, derivadas del horario de atención. */
export function generarEspacios(): { nombre: string; horas: string[] }[] {
  return HORARIO_ATENCION.map((bloque) => {
    const horas: string[] = []
    const fin = aMinutos(bloque.fin)
    for (let t = aMinutos(bloque.inicio); t + SLOT_MINUTOS <= fin; t += SLOT_MINUTOS) {
      horas.push(aHora(t))
    }
    return { nombre: bloque.nombre, horas }
  })
}

/** Convierte una fecha ('yyyy-MM-dd') y hora ('HH:mm') de la clínica a TIMESTAMPTZ ISO. */
export function horaClinicaAIso(fecha: string, hora: string): string {
  return fromClinicTime(`${fecha}T${hora}:00`)
}

/**
 * Un espacio [inicio, inicio+30min) está ocupado si se **solapa** con alguna
 * cita del veterinario. Se compara por solapamiento y no por hora exacta
 * porque existen citas fuera de la grilla (p. ej. las que crea
 * `iniciarConsultaLibre` con la hora actual). Las citas canceladas liberan
 * el espacio.
 */
export function citaQueOcupa(inicioIso: string, citas: Cita[]): Cita | undefined {
  const inicio = new Date(inicioIso).getTime()
  const fin = inicio + SLOT_MINUTOS * 60_000

  return citas.find((cita) => {
    if (cita.estado === 'cancelada') return false
    const citaInicio = new Date(cita.fecha_hora).getTime()
    const citaFin = citaInicio + SLOT_MINUTOS * 60_000
    return inicio < citaFin && citaInicio < fin
  })
}

/** Espacios del día agrupados por bloque, marcando cuáles ocupa ya el veterinario. */
export function calcularDisponibilidad(fecha: string, citasDelVeterinario: Cita[]): BloqueEspacios[] {
  return generarEspacios().map(({ nombre, horas }) => ({
    nombre,
    espacios: horas.map((hora) => {
      const inicioIso = horaClinicaAIso(fecha, hora)
      const citaOcupante = citaQueOcupa(inicioIso, citasDelVeterinario)
      return { hora, inicioIso, ocupado: !!citaOcupante, citaOcupante }
    }),
  }))
}

export function contarDisponibles(bloques: BloqueEspacios[]): { libres: number; total: number } {
  const espacios = bloques.flatMap((b) => b.espacios)
  return { libres: espacios.filter((e) => !e.ocupado).length, total: espacios.length }
}
