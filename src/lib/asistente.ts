import { formatClinicDate, formatClinicDateTime, formatClinicTime } from './datetime'
import type { Programado, ResumenDelDia, TipoAviso } from '../types/views'

// Helpers puros del asistente: cuánto se anticipa cada aviso, qué texto se usa
// cuando no hay IA disponible, y —lo más importante— qué datos se le mandan.
// Aquí no se toca el store ni la red.

export const TIPO_AVISO_LABEL: Record<TipoAviso, string> = {
  recordatorio_cita: 'Recordatorio de cita',
  preparacion_cirugia: 'Preparación de cirugía',
  refuerzo_vacuna: 'Refuerzo de vacuna',
  proxima_desparasitacion: 'Próxima desparasitación',
}

/**
 * Cuánto se mira hacia delante para cada aviso.
 *
 * La cita se recuerda el día antes (PRD Épica 4: "24h antes"), y la cirugía dos
 * días antes porque el ayuno empieza la noche previa. Los refuerzos se avisan
 * con un mes de margen: son fechas que el dueño no tiene apuntadas.
 */
export const DIAS_ANTICIPACION: Record<TipoAviso, number> = {
  recordatorio_cita: 1,
  preparacion_cirugia: 2,
  refuerzo_vacuna: 30,
  proxima_desparasitacion: 30,
}

/**
 * Lo único que sale de la clínica hacia el modelo. Deliberadamente **no**
 * incluye el número de WhatsApp, el CI del dueño, el diagnóstico ni nada del
 * historial: para redactar un aviso no hacen falta, y lo que no se manda no se
 * puede filtrar. El teléfono se usa después, ya en el navegador, al construir
 * el enlace de WhatsApp.
 */
export interface ContextoAviso {
  tipo: TipoAviso
  clinica: string
  paciente: string
  especie: string
  /** Nombre de pila del dueño, para que el saludo no suene a circular. */
  dueno: string
  fecha_legible: string
  hora_legible?: string
  detalle: string
  vencido: boolean
}

export function contextoDeAviso(aviso: Programado, clinicaNombre: string): ContextoAviso {
  const esCita = aviso.tipo === 'recordatorio_cita' || aviso.tipo === 'preparacion_cirugia'
  return {
    tipo: aviso.tipo,
    clinica: clinicaNombre,
    paciente: aviso.paciente_nombre,
    especie: aviso.especie,
    dueno: aviso.cliente_nombre.split(' ')[0] ?? aviso.cliente_nombre,
    fecha_legible: formatClinicDate(aviso.fecha),
    hora_legible: esCita ? formatClinicTime(aviso.fecha) : undefined,
    detalle: aviso.detalle,
    vencido: aviso.vencido,
  }
}

/**
 * Texto de respaldo. Se usa mientras la Edge Function no esté desplegada (es
 * decir, en todo el modo de demostración) y cuando la llamada falla: un aviso
 * correcto y aburrido siempre es mejor que ninguno.
 */
export function plantillaAviso(aviso: Programado, clinicaNombre: string): string {
  const c = contextoDeAviso(aviso, clinicaNombre)
  const firma = `\n\n${clinicaNombre}`

  switch (aviso.tipo) {
    case 'recordatorio_cita':
      return (
        `Hola ${c.dueno}, le recordamos la cita de ${c.paciente} ` +
        `el ${c.fecha_legible} a las ${c.hora_legible}.` +
        `\n\nMotivo: ${c.detalle}.` +
        `\n\nSi no puede asistir, respóndanos para reprogramarla.${firma}`
      )
    case 'preparacion_cirugia':
      return (
        `Hola ${c.dueno}, la cirugía de ${c.paciente} (${c.detalle}) ` +
        `es el ${c.fecha_legible} a las ${c.hora_legible}.` +
        `\n\nIndicaciones: ayuno de alimento de 8 a 12 horas antes. ` +
        `Puede tomar agua hasta 2 horas antes. Traiga a ${c.paciente} con correa o transportadora.` +
        `\n\nSi tiene dudas, escríbanos.${firma}`
      )
    case 'refuerzo_vacuna':
      return c.vencido
        ? `Hola ${c.dueno}, el refuerzo de ${c.detalle} de ${c.paciente} venció el ${c.fecha_legible}. ` +
            `Escríbanos para agendar la aplicación y mantener la protección al día.${firma}`
        : `Hola ${c.dueno}, a ${c.paciente} le toca el refuerzo de ${c.detalle} el ${c.fecha_legible}. ` +
            `Escríbanos para reservar el turno.${firma}`
    case 'proxima_desparasitacion':
      return c.vencido
        ? `Hola ${c.dueno}, la desparasitación de ${c.paciente} estaba prevista para el ${c.fecha_legible} ` +
            `y aún está pendiente. Escríbanos y le damos un turno.${firma}`
        : `Hola ${c.dueno}, a ${c.paciente} le toca la próxima desparasitación el ${c.fecha_legible}. ` +
            `Escríbanos para agendarla.${firma}`
  }
}

/** Informe de respaldo para el administrador, con la misma información que vería en pantalla. */
export function plantillaInforme(resumen: ResumenDelDia, clinicaNombre: string): string {
  const lineas = [
    `${clinicaNombre} — resumen del ${formatClinicDate(resumen.fecha)}`,
    '',
    `Citas de hoy: ${resumen.citas_hoy} (${resumen.sin_confirmar} sin confirmar)`,
    `Refuerzos vencidos: ${resumen.refuerzos_vencidos}`,
  ]
  if (resumen.cirugias_sin_consentimiento > 0) {
    lineas.push(`Cirugías próximas sin consentimiento firmado: ${resumen.cirugias_sin_consentimiento}`)
  }
  if (resumen.productos_bajo_minimo.length > 0) {
    lineas.push(`Stock bajo mínimo: ${resumen.productos_bajo_minimo.join(', ')}`)
  }
  lineas.push(`Cobrado hoy: Bs. ${resumen.ingresos_hoy_bs.toFixed(2)}`)
  return lineas.join('\n')
}

/** Cómo se lee un aviso en la lista: "mañana 09:00", "venció hace 8 días". */
export function cuandoLegible(aviso: Programado, ahora = new Date()): string {
  const dias = diasDeDiferencia(aviso.fecha, ahora)
  if (aviso.vencido) {
    const vencidoHace = Math.abs(dias)
    return vencidoHace === 0 ? 'vencía hoy' : `venció hace ${vencidoHace} ${vencidoHace === 1 ? 'día' : 'días'}`
  }
  const esCita = aviso.tipo === 'recordatorio_cita' || aviso.tipo === 'preparacion_cirugia'
  const hora = esCita ? ` ${formatClinicTime(aviso.fecha)}` : ''
  if (dias === 0) return `hoy${hora}`
  if (dias === 1) return `mañana${hora}`
  return `en ${dias} días${esCita ? ` · ${formatClinicDateTime(aviso.fecha)}` : ''}`
}

/**
 * Días completos entre hoy y una fecha, contados **en la zona de la clínica**:
 * comparar instantes daría "mañana" para algo que aquí sigue siendo hoy.
 */
export function diasDeDiferencia(fechaIso: string, ahora = new Date()): number {
  const dia = (iso: string) => formatClinicDate(iso).split('/').reverse().join('-')
  const objetivo = new Date(`${dia(fechaIso)}T00:00:00Z`).getTime()
  const referencia = new Date(`${dia(ahora.toISOString())}T00:00:00Z`).getTime()
  return Math.round((objetivo - referencia) / 86_400_000)
}
