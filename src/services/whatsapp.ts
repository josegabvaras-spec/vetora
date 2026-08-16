import { supabase } from '../lib/supabase'
import { enlaceWhatsapp } from '../lib/whatsapp'
import { getPlan } from './planes'

export async function getCuotaWhatsapp(clinicaId: string) {
  const { data: clinica } = await supabase.from('clinicas').select('plan_id, whatsapp_mensajes_enviados').eq('id', clinicaId).single()
  if (!clinica) throw new Error('Clínica no encontrada')
  const plan = await getPlan(clinica.plan_id)
  const limite = plan?.whatsapp_limite ?? 0
  return {
    enviados: clinica.whatsapp_mensajes_enviados,
    limite,
    disponible: Math.max(0, limite - clinica.whatsapp_mensajes_enviados),
  }
}

export async function enviarMensajeWhatsapp(clinicaId: string, whatsapp: string, mensaje: string): Promise<string> {
  const { data: clinica } = await supabase.from('clinicas').select('id, plan_id, whatsapp_mensajes_enviados').eq('id', clinicaId).single()
  if (!clinica) throw new Error('Clínica no encontrada')
  
  const plan = await getPlan(clinica.plan_id)
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

  const { error } = await supabase.from('clinicas').update({
    whatsapp_mensajes_enviados: clinica.whatsapp_mensajes_enviados + 1
  }).eq('id', clinica.id)

  if (error) throw new Error('No se pudo registrar el envío del mensaje')
  return enlaceWhatsapp(whatsapp, mensaje)
}
