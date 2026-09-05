import { supabase } from '../lib/supabase'
import { contextoDeAviso, plantillaAviso, plantillaAvisoInterno, plantillaInforme, plantillaMensajeLibre } from '../lib/asistente'
import { enviadosEsteMes } from './whatsapp'
import { getPlan } from './planes'
import type { Programado, RespuestaCopiloto, ResumenDelDia } from '../types/views'

export interface Redaccion {
  texto: string
  origen: 'ia' | 'plantilla'
  motivo?: string
}

type Tarea = 'aviso' | 'aviso_interno' | 'informe' | 'mensaje_libre' | 'copiloto'

const SIN_IA = 'El asistente de IA no está configurado; texto generado con la plantilla del sistema.'

/** Lo que devolvió el intento: el texto del modelo, o por qué no lo hay. */
interface Intento {
  texto?: string
  motivo?: string
}

/**
 * Por qué no se pudo redactar, en palabras que sirvan.
 *
 * La Edge Function distingue «no hay cuota» (429) de «el plan no lo incluye»
 * (403) y de un fallo cualquiera (500), y esa diferencia importa: sin ella, una
 * clínica que agotó su cupo mensual ve exactamente lo mismo que una a la que
 * nunca le configuraron la clave, y concluye que la IA está rota.
 */
async function motivoDelError(error: unknown, generico = SIN_IA): Promise<string> {
  const respuesta = (error as { context?: Response } | null)?.context
  if (respuesta && typeof respuesta.json === 'function') {
    try {
      const cuerpo = await respuesta.json()
      if (typeof cuerpo?.error === 'string' && cuerpo.error !== 'refusal') return cuerpo.error
    } catch {
      // El cuerpo no era JSON, o ya se había consumido. Vale el genérico.
    }
  }
  return generico
}

/**
 * Llama al modelo a través de la Edge Function.
 *
 * ⚠️ **No se corta en `localhost`.** Antes había una guarda
 * (`window.location.hostname === 'localhost'`) que apagaba la IA en desarrollo,
 * mientras la cabecera de la propia función explica cómo probarla ahí con
 * `supabase functions serve`. Las dos cosas no podían ser ciertas a la vez, y la
 * que sobraba era la guarda: sin la función servida, `invoke` falla y se cae a
 * la plantilla igual, que es justo lo que tiene que pasar.
 */
async function pedirALaIA(tarea: Tarea, contexto: unknown, pregunta?: string): Promise<Intento> {
  if (!supabase) return {}

  try {
    const { data, error } = await supabase.functions.invoke<{ texto?: string }>('asistente', {
      body: { tarea, contexto, pregunta },
    })
    if (error) return { motivo: await motivoDelError(error) }
    if (!data?.texto?.trim()) return {}
    return { texto: data.texto.trim() }
  } catch {
    return {}
  }
}

async function clinicaEnSesion(): Promise<string> {
  const { data } = await supabase.from('clinicas').select('nombre').limit(1).maybeSingle()
  return data?.nombre ?? 'Su veterinaria'
}

export interface CuotaIa {
  redaccion: { usados: number; limite: number }
  copiloto: { usados: number; limite: number }
}

/**
 * Cuánto lleva gastado la clínica de cada cupo de IA este mes, frente a su
 * plan.
 *
 * Dos cupos, no uno (migración 0039): un aviso en Haiku y una pregunta al
 * copiloto en Sonnet cuestan ~19 veces distinto, así que tienen contadores y
 * topes separados. `enviadosEsteMes()` es la misma función que ya usa la
 * cuota de WhatsApp —es genérica: contador más periodo, nada específico de
 * WhatsApp— y no hay motivo para escribirla dos veces.
 *
 * Igual que `getCuotaWhatsapp`: si el plan no se pudo leer, lanza en vez de
 * devolver un cupo en cero. Un fallo de lectura no es lo mismo que una cuota
 * agotada, y no pueden verse igual en la interfaz.
 */
export async function getCuotaIa(clinicaId: string): Promise<CuotaIa> {
  const { data: clinica } = await supabase
    .from('clinicas')
    .select('plan_id, ia_consultas_redaccion, ia_periodo_redaccion, ia_consultas_copiloto, ia_periodo_copiloto')
    .eq('id', clinicaId)
    .single()

  if (!clinica) throw new Error('Clínica no encontrada')

  const plan = await getPlan(clinica.plan_id)
  if (!plan) throw new Error('No se pudo leer el plan de la clínica')

  return {
    redaccion: {
      usados: enviadosEsteMes(clinica.ia_consultas_redaccion, clinica.ia_periodo_redaccion),
      limite: plan.ia_limite_redaccion,
    },
    copiloto: {
      usados: enviadosEsteMes(clinica.ia_consultas_copiloto, clinica.ia_periodo_copiloto),
      limite: plan.ia_limite_copiloto,
    },
  }
}

export async function contactoAdministracion(): Promise<{ nombre: string; whatsapp: string }> {
  const { data: clinica } = await supabase.from('clinicas').select('responsable, whatsapp').limit(1).maybeSingle()
  if (!clinica?.whatsapp) {
    throw new Error('La clínica no tiene un WhatsApp de contacto registrado')
  }
  return { nombre: clinica.responsable, whatsapp: clinica.whatsapp }
}

export async function redactarAviso(aviso: Programado): Promise<Redaccion> {
  const clinica = await clinicaEnSesion()
  const { texto, motivo } = await pedirALaIA('aviso', contextoDeAviso(aviso, clinica))
  if (texto) return { texto, origen: 'ia' }
  return { texto: plantillaAviso(aviso, clinica), origen: 'plantilla', motivo: motivo ?? SIN_IA }
}

export async function redactarAvisoInterno(aviso: Programado): Promise<Redaccion> {
  const clinica = await clinicaEnSesion()
  const { texto, motivo } = await pedirALaIA('aviso_interno', contextoDeAviso(aviso, clinica))
  if (texto) return { texto, origen: 'ia' }
  return { texto: plantillaAvisoInterno(aviso, clinica), origen: 'plantilla', motivo: motivo ?? SIN_IA }
}

export async function redactarInforme(resumen: ResumenDelDia): Promise<Redaccion> {
  const clinica = await clinicaEnSesion()
  const { texto, motivo } = await pedirALaIA('informe', { clinica, ...resumen })
  if (texto) return { texto, origen: 'ia' }
  return { texto: plantillaInforme(resumen, clinica), origen: 'plantilla', motivo: motivo ?? SIN_IA }
}

/**
 * Un mensaje suelto, sin `Programado` detrás — "escríbele a Juan que traiga
 * la muestra mañana". Sigue siendo redacción, no una pregunta al negocio: va
 * en Haiku igual que un aviso, no en el copiloto, y gasta el mismo cupo
 * (`ia_limite_redaccion`) que aviso/aviso_interno/informe, no el del
 * copiloto — 20 veces más grande, pensado justo para este tipo de uso suelto.
 */
export async function redactarMensajeLibre(
  pedido: string,
  destinatario: { dueno?: string; paciente?: string } = {},
): Promise<Redaccion> {
  const pedidoLimpio = pedido.trim()
  const clinica = await clinicaEnSesion()
  const { texto, motivo } = await pedirALaIA(
    'mensaje_libre',
    { clinica, dueno: destinatario.dueno || undefined, paciente: destinatario.paciente || undefined },
    pedidoLimpio,
  )
  if (texto) return { texto, origen: 'ia' }
  return {
    texto: plantillaMensajeLibre(pedidoLimpio, destinatario.dueno),
    origen: 'plantilla',
    motivo: motivo ?? SIN_IA,
  }
}

/**
 * Una pregunta al copiloto sobre el negocio.
 *
 * ⚠️ **Aquí no hay plantilla que valga.** Los avisos y el informe caen a un
 * texto determinista cuando el modelo falla, porque hay algo sensato que
 * escribir sin él. Una pregunta abierta no: inventarse una respuesta sería
 * exactamente lo que el copiloto tiene prohibido hacer. Si falla, se dice.
 *
 * Los datos NO se mandan desde aquí. La Edge Function los consulta ella con el
 * token de quien pregunta, así que la RLS acota lo que la IA puede ver igual
 * que acota lo que ve la pantalla.
 */
export async function preguntarACopiloto(pregunta: string): Promise<RespuestaCopiloto> {
  if (!supabase) throw new Error('No hay conexión con el servidor')

  const { data, error } = await supabase.functions.invoke<{
    respuesta?: RespuestaCopiloto
    herramientas?: string[]
  }>('asistente', { body: { tarea: 'copiloto', pregunta } })

  if (error) throw new Error(await motivoDelError(error, 'No se pudo consultar al asistente'))
  if (!data?.respuesta) throw new Error('El asistente no devolvió una respuesta')

  return { ...data.respuesta, fuentes: data.herramientas ?? [] }
}
