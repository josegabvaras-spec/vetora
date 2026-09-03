import { supabase } from '../lib/supabase'
import { contextoDeAviso, plantillaAviso, plantillaAvisoInterno, plantillaInforme } from '../lib/asistente'
import type { Programado, ResumenDelDia } from '../types/views'

export interface Redaccion {
  texto: string
  origen: 'ia' | 'plantilla'
  motivo?: string
}

type Tarea = 'aviso' | 'aviso_interno' | 'informe'

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
async function motivoDelError(error: unknown): Promise<string> {
  const respuesta = (error as { context?: Response } | null)?.context
  if (respuesta && typeof respuesta.json === 'function') {
    try {
      const cuerpo = await respuesta.json()
      if (typeof cuerpo?.error === 'string' && cuerpo.error !== 'refusal') return cuerpo.error
    } catch {
      // El cuerpo no era JSON, o ya se había consumido. Vale el genérico.
    }
  }
  return SIN_IA
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
async function pedirALaIA(tarea: Tarea, contexto: unknown): Promise<Intento> {
  if (!supabase) return {}

  try {
    const { data, error } = await supabase.functions.invoke<{ texto?: string }>('asistente', {
      body: { tarea, contexto },
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
