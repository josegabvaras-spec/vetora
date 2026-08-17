import { supabase } from '../lib/supabase'
import { enlaceWhatsapp } from '../lib/whatsapp'
import { clinicMonth } from '../lib/datetime'
import { getPlan } from './planes'

/**
 * Consumo del mes en curso. El contador guardado puede ser del mes pasado: se
 * reinicia con el primer envío, no a medianoche, así que hasta entonces hay que
 * leerlo junto a su periodo. Sin esto la barra del `Topbar` enseñaría la cuota
 * agotada el día 1 hasta que alguien mandara el primer mensaje.
 */
export async function getCuotaWhatsapp(clinicaId: string) {
  const { data: clinica } = await supabase
    .from('clinicas')
    .select('plan_id, whatsapp_mensajes_enviados, whatsapp_periodo')
    .eq('id', clinicaId)
    .single()

  if (!clinica) throw new Error('Clínica no encontrada')

  const plan = await getPlan(clinica.plan_id)
  const limite = plan?.whatsapp_limite ?? 0
  const enviados = enviadosEsteMes(clinica.whatsapp_mensajes_enviados, clinica.whatsapp_periodo)

  return {
    enviados,
    limite,
    disponible: Math.max(0, limite - enviados),
  }
}

/** Cero si el contador guardado pertenece a un periodo ya cerrado. */
export function enviadosEsteMes(contador: number, periodo: string | null): number {
  if (!periodo) return contador
  const mesActual = clinicMonth(new Date().toISOString())
  // `whatsapp_periodo` es un `date` ('yyyy-MM-dd'); basta comparar el prefijo.
  return periodo.slice(0, 7) === mesActual ? contador : 0
}

/**
 * Valida el tope del plan y devuelve el enlace `wa.me` listo para abrir.
 *
 * **Todo aviso a un cliente pasa por aquí.** La comprobación y el consumo los
 * hace `consumir_cuota_whatsapp()` en una sola sentencia SQL: hacerlo en el
 * cliente sería leer el contador, decidir y escribir en tres viajes, y dos
 * pestañas con la cuota al límite pasarían las dos.
 *
 * Se lee el plan antes solo para poder nombrarlo en el error; la barrera real
 * es la función, y el enlace no se entrega si no hubo cuota.
 */
export async function enviarMensajeWhatsapp(
  clinicaId: string,
  whatsapp: string,
  mensaje: string,
): Promise<string> {
  if (!whatsapp.replace(/\D/g, '')) {
    throw new Error('El cliente no tiene un número de WhatsApp registrado')
  }
  if (!mensaje.trim()) throw new Error('El mensaje está vacío')

  const { error } = await supabase.rpc('consumir_cuota_whatsapp')

  if (error) {
    throw new Error(await motivoSinCuota(clinicaId))
  }

  return enlaceWhatsapp(whatsapp, mensaje)
}

/** El plan y su tope, para que el error diga algo útil en vez de un código. */
async function motivoSinCuota(clinicaId: string): Promise<string> {
  try {
    const { limite } = await getCuotaWhatsapp(clinicaId)
    const { data } = await supabase.from('clinicas').select('plan_id').eq('id', clinicaId).single()
    const plan = data ? await getPlan(data.plan_id) : null
    if (plan) {
      return `Se alcanzó el límite mensual de ${limite} mensajes del plan ${plan.nombre}`
    }
  } catch {
    // Si ni siquiera se puede leer el plan, vale el mensaje genérico.
  }
  return 'Se alcanzó el límite mensual de mensajes del plan'
}
