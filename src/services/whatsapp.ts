import { db } from '../mocks/db'
import { enlaceWhatsapp } from '../lib/whatsapp'
import { getPlan } from './planes'

function delay<T>(value: T): Promise<T> {
  return Promise.resolve(value)
}

function clinicaEnSesion() {
  const id = db.clinicaActivaId()
  const clinica = db.get('clinicas').find((c) => c.id === id)
  if (!clinica) throw new Error('Clínica no encontrada')
  return clinica
}

/** El tope mensual lo fija el plan contratado, no la clínica. */
export function getCuotaWhatsapp() {
  const clinica = clinicaEnSesion()
  const limite = getPlan(clinica.plan_id)?.whatsapp_limite ?? 0
  return {
    enviados: clinica.whatsapp_mensajes_enviados,
    limite,
    disponible: Math.max(0, limite - clinica.whatsapp_mensajes_enviados),
  }
}

/**
 * PRD §5.2: "WhatsApp: Validación estricta del tope mensual de mensajes antes
 * de disparar el API." Envío one-way, nunca conversacional: **todo** lo que la
 * clínica manda a un cliente pasa por aquí, de modo que la cuota se comprueba
 * en un solo sitio y no en cada pantalla que quiera avisar algo.
 *
 * Devuelve el enlace `wa.me` con el texto ya cargado. Quien llama lo abre; la
 * cuota se descuenta al llegar aquí, que es el momento en que el mensaje deja
 * de estar en manos de la aplicación.
 */
export async function enviarMensajeWhatsapp(whatsapp: string, mensaje: string): Promise<string> {
  const clinica = clinicaEnSesion()
  const plan = getPlan(clinica.plan_id)
  if (!plan) throw new Error('La clínica no tiene un plan válido asignado')

  if (!whatsapp.replace(/\D/g, '')) {
    throw new Error('El cliente no tiene un número de WhatsApp registrado')
  }
  if (!mensaje.trim()) throw new Error('El mensaje está vacío')

  if (clinica.whatsapp_mensajes_enviados >= plan.whatsapp_limite) {
    throw new Error(
      `Se alcanzó el límite mensual de ${plan.whatsapp_limite} mensajes del plan ${plan.nombre}`,
    )
  }

  db.set(
    'clinicas',
    db
      .get('clinicas')
      .map((c) =>
        c.id === clinica.id ? { ...c, whatsapp_mensajes_enviados: c.whatsapp_mensajes_enviados + 1 } : c,
      ),
  )
  return delay(enlaceWhatsapp(whatsapp, mensaje))
}
