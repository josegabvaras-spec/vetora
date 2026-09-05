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
  seguimiento_post_consulta: 'Seguimiento',
  cumpleanos_paciente: 'Cumpleaños',
  atencion_sin_cobrar: 'Cobro pendiente',
  examen_listo: 'Examen listo',
  paciente_inactivo: 'Paciente inactivo',
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
  seguimiento_post_consulta: 3, // Avisa hasta 3 días post-consulta
  cumpleanos_paciente: 1, // Avisa desde 1 día antes o el mismo día
  atencion_sin_cobrar: 7, // Avisa hasta por 7 días
  examen_listo: 7, // Avisa hasta 7 días desde que está listo
  paciente_inactivo: 30, // Ventana larga para reactivación
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
    case 'seguimiento_post_consulta':
      return `Hola ${c.dueno}, queríamos saber cómo sigue ${c.paciente} luego de su visita del ${c.fecha_legible}. ` +
             `Por favor coméntenos si ha notado alguna mejoría o si tiene alguna duda.${firma}`
    case 'cumpleanos_paciente':
      return `¡Hola ${c.dueno}! Hoy es un día muy especial, ¡es el cumpleaños de ${c.paciente}! 🥳🐾 ` +
             `De parte de todo el equipo de ${c.clinica} le mandamos un abrazo gigante y esperamos verlo pronto para festejar.${firma}`
    case 'atencion_sin_cobrar':
      return `Hola ${c.dueno}, le informamos que tiene un saldo pendiente por la atención de ${c.paciente} ` +
             `del día ${c.fecha_legible}. Puede comunicarse con nosotros para coordinar el pago.${firma}`
    case 'examen_listo':
      return `Hola ${c.dueno}, los resultados del laboratorio de ${c.paciente} ya están listos. ` +
             `Puede pasar por la clínica o escribirnos para agendar una cita y revisarlos.${firma}`
    case 'paciente_inactivo':
      return `Hola ${c.dueno}, notamos que ha pasado un buen tiempo desde la última visita de ${c.paciente} a la clínica. ` +
             `Recuerde que un chequeo anual es clave para su salud. ¡Escríbanos para agendar una cita de rutina!${firma}`
  }
}

/**
 * Texto de respaldo dirigido al equipo interno (recepción / médicos).
 */
export function plantillaAvisoInterno(aviso: Programado, clinicaNombre: string): string {
  const c = contextoDeAviso(aviso, clinicaNombre)
  
  switch (aviso.tipo) {
    case 'recordatorio_cita':
      return (
        `Atención equipo: Hoy tenemos programada la cita de ${c.paciente} (Dueño: ${c.dueno}) ` +
        `a las ${c.hora_legible}.` +
        `\n\nMotivo: ${c.detalle}.`
      )
    case 'preparacion_cirugia':
      return (
        `Atención equipo: Tenemos agendada la cirugía de ${c.paciente} (Dueño: ${c.dueno}) ` +
        `para el ${c.fecha_legible} a las ${c.hora_legible}.` +
        `\n\nProcedimiento: ${c.detalle}.` +
        `\nPor favor, confirmar ayuno con el cliente si aún no se hizo.`
      )
    case 'refuerzo_vacuna':
      return c.vencido
        ? `Atención equipo: El refuerzo de ${c.detalle} de ${c.paciente} (Dueño: ${c.dueno}) venció el ${c.fecha_legible}. ` +
            `Contactar al cliente para reprogramar.`
        : `Atención equipo: A ${c.paciente} (Dueño: ${c.dueno}) le toca el refuerzo de ${c.detalle} el ${c.fecha_legible}. ` +
            `Revisar si ya se agendó.`
    case 'proxima_desparasitacion':
      return c.vencido
        ? `Atención equipo: La desparasitación de ${c.paciente} (Dueño: ${c.dueno}) estaba prevista para el ${c.fecha_legible} y sigue pendiente. Contactar.`
        : `Atención equipo: A ${c.paciente} (Dueño: ${c.dueno}) le toca desparasitación el ${c.fecha_legible}.`
    case 'seguimiento_post_consulta':
      return `Atención equipo: Hacer seguimiento a ${c.paciente} (Dueño: ${c.dueno}) por su visita del ${c.fecha_legible}.`
    case 'cumpleanos_paciente':
      return `Atención equipo: Hoy es cumpleaños de ${c.paciente} (Dueño: ${c.dueno}). ¡Felicitar!`
    case 'atencion_sin_cobrar':
      return `Atención equipo: La atención de ${c.paciente} (Dueño: ${c.dueno}) del ${c.fecha_legible} sigue pendiente de cobro.`
    case 'examen_listo':
      return `Atención equipo: Informar a ${c.dueno} que los laboratorios de ${c.paciente} ya están listos.`
    case 'paciente_inactivo':
      return `Atención equipo: ${c.paciente} (Dueño: ${c.dueno}) no ha venido hace más de un año. Contactar para reactivación.`
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

/**
 * Texto de respaldo para un mensaje libre, si la IA falla. A diferencia de
 * `plantillaAviso`, aquí no hay una forma fija por `tipo` que rellenar — el
 * único contenido cierto es lo que la persona ya escribió en el pedido, así
 * que el respaldo es justamente eso, con un saludo delante si hay a quién
 * saludar. Peor que la versión pulida por IA, pero nunca vacío.
 */
export function plantillaMensajeLibre(pedido: string, dueno?: string): string {
  const saludo = dueno ? `Hola ${dueno}, ` : ''
  return `${saludo}${pedido.trim()}`
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
