import { formatUsd, usdABs } from './currency'
import { formatClinicDate } from './datetime'

/**
 * Asistente del dueño de la plataforma: qué le toca atender hoy.
 *
 * Vigila el negocio, no los pacientes. El superadmin solo puede leer clínicas,
 * usuarios, planes e invitaciones —su `clinica_id` es null y la RLS le cierra
 * las tablas clínicas—, así que todo lo de aquí sale de esas cuatro.
 *
 * **Sin IA, a propósito.** La única integración del proyecto es la API de
 * Anthropic, que no está desplegada ni configurada; y estos mensajes (un cobro
 * vencido, un plan que se queda corto) son repetitivos y se escriben mejor con
 * plantilla que con un modelo.
 */

export type TipoTareaPlataforma = 'cobro_vencido' | 'cobro_proximo' | 'limite_plan' | 'errores_sistema'

export const TAREA_LABEL: Record<TipoTareaPlataforma, string> = {
  cobro_vencido: 'Cobro vencido',
  cobro_proximo: 'Cobro próximo',
  limite_plan: 'Cerca del límite del plan',
  errores_sistema: 'Errores del sistema',
}

/** Con cuántos días de antelación se avisa de un cobro que va a vencer. */
export const DIAS_AVISO_COBRO = 7

/** A partir de qué proporción del tope se considera que una clínica va justa. */
export const UMBRAL_LIMITE = 0.8

export interface TareaPlataforma {
  /** Estable entre recargas: tipo + fila de origen. */
  id: string
  tipo: TipoTareaPlataforma
  /** Clínica implicada. Null en las tareas que no son de ninguna (errores). */
  clinica_id: string | null
  clinica_nombre: string
  responsable: string
  whatsapp: string
  detalle: string
  /** Día clínico `yyyy-MM-dd`, o null si la tarea no tiene fecha. */
  fecha: string | null
  vencido: boolean
}

/**
 * Mensaje al responsable de la clínica.
 *
 * Lo manda el dueño de la plataforma a su cliente, así que el tono es de
 * proveedor a negocio, no de veterinaria a dueño de mascota.
 */
export function plantillaTarea(tarea: TareaPlataforma, plataforma = 'Vetora'): string {
  const nombre = tarea.responsable.split(' ')[0] || tarea.clinica_nombre
  const cuando = tarea.fecha ? formatClinicDate(`${tarea.fecha}T12:00:00Z`) : ''

  switch (tarea.tipo) {
    case 'cobro_vencido':
      return (
        `Hola ${nombre}, te escribo de ${plataforma}.\n\n` +
        `La suscripción de ${tarea.clinica_nombre} tiene un pago pendiente${cuando ? ` desde el ${cuando}` : ''}: ${tarea.detalle}.\n\n` +
        `¿Nos confirmas cuándo podrías regularizarlo? Cualquier cosa, quedo atento.`
      )

    case 'cobro_proximo':
      return (
        `Hola ${nombre}, te escribo de ${plataforma}.\n\n` +
        `Te recuerdo que la suscripción de ${tarea.clinica_nombre} vence el ${cuando}: ${tarea.detalle}.\n\n` +
        `Si necesitas factura o cambiar la forma de pago, avísame.`
      )

    case 'limite_plan':
      return (
        `Hola ${nombre}, te escribo de ${plataforma}.\n\n` +
        `${tarea.clinica_nombre} está acercándose al tope de su plan: ${tarea.detalle}.\n\n` +
        `Te aviso antes de que les limite el trabajo. Si quieres, revisamos juntos qué plan les conviene.`
      )

    // No se le manda a nadie: es una tarea interna del propio dueño.
    case 'errores_sistema':
      return `Revisar los errores registrados en las últimas 24 horas: ${tarea.detalle}.`
  }
}

/** Un aviso de errores no se le manda a la clínica: es trabajo interno. */
export function seAvisaPorWhatsapp(tarea: TareaPlataforma): boolean {
  return tarea.tipo !== 'errores_sistema' && Boolean(tarea.whatsapp.trim())
}

/**
 * Detalle legible del importe de una suscripción.
 *
 * Nombra las dos monedas porque las dos hacen falta: el precio está fijado en
 * dólares, pero quien recibe el mensaje paga en bolivianos y necesita saber la
 * cifra que va a transferir.
 */
export function detalleDeCobro(precioUsd: number, tipoCambio: number): string {
  return `${formatUsd(precioUsd)} (Bs. ${usdABs(precioUsd, tipoCambio).toFixed(2)}) de suscripción mensual`
}
