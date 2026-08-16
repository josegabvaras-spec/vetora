import { supabase, isMockMode } from '../lib/supabase'
import { contextoDeAviso, plantillaAviso, plantillaAvisoInterno, plantillaInforme } from '../lib/asistente'
import type { Programado, ResumenDelDia } from '../types/views'

export interface Redaccion {
  texto: string
  origen: 'ia' | 'plantilla'
  motivo?: string
}

type Tarea = 'aviso' | 'aviso_interno' | 'informe'

const SIN_IA = 'El asistente de IA no está configurado; texto generado con la plantilla del sistema.'

async function pedirALaIA(tarea: Tarea, contexto: unknown): Promise<Redaccion | null> {
  if (isMockMode || !supabase || window.location.hostname === 'localhost') return null

  try {
    const { data, error } = await supabase.functions.invoke<{ texto?: string }>('asistente', {
      body: { tarea, contexto },
    })
    if (error || !data?.texto?.trim()) return null
    return { texto: data.texto.trim(), origen: 'ia' }
  } catch {
    return null
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
  const conIa = await pedirALaIA('aviso', contextoDeAviso(aviso, clinica))
  return conIa ?? { texto: plantillaAviso(aviso, clinica), origen: 'plantilla', motivo: SIN_IA }
}

export async function redactarAvisoInterno(aviso: Programado): Promise<Redaccion> {
  const clinica = await clinicaEnSesion()
  const conIa = await pedirALaIA('aviso_interno', contextoDeAviso(aviso, clinica))
  return conIa ?? { texto: plantillaAvisoInterno(aviso, clinica), origen: 'plantilla', motivo: SIN_IA }
}

export async function redactarInforme(resumen: ResumenDelDia): Promise<Redaccion> {
  const clinica = await clinicaEnSesion()
  const conIa = await pedirALaIA('informe', { clinica, ...resumen })
  return conIa ?? { texto: plantillaInforme(resumen, clinica), origen: 'plantilla', motivo: SIN_IA }
}
