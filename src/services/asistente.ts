import { db } from '../mocks/db'
import { isMockMode, supabase } from '../lib/supabase'
import { contextoDeAviso, plantillaAviso, plantillaInforme } from '../lib/asistente'
import type { Programado, ResumenDelDia } from '../types/views'

/**
 * Única puerta hacia la IA. El modelo se llama desde una Edge Function de
 * Supabase (`supabase/functions/asistente`), nunca desde el navegador: una
 * clave de API en el frontend viaja dentro del bundle y cualquiera que abra la
 * aplicación puede extraerla.
 *
 * Si la función no está desplegada —que es el caso en todo el modo de
 * demostración— se cae a las plantillas de `lib/asistente`. El resultado dice
 * de dónde vino, y la interfaz lo muestra: un texto de plantilla no se puede
 * presentar como redactado por la IA.
 */
export interface Redaccion {
  texto: string
  origen: 'ia' | 'plantilla'
  /** Por qué no hubo IA, cuando corresponde. Se enseña como aviso discreto. */
  motivo?: string
}

type Tarea = 'aviso' | 'informe'

const SIN_IA = 'El asistente de IA no está configurado; texto generado con la plantilla del sistema.'

async function pedirALaIA(tarea: Tarea, contexto: unknown): Promise<Redaccion | null> {
  if (isMockMode || !supabase) return null

  try {
    const { data, error } = await supabase.functions.invoke<{ texto?: string }>('asistente', {
      body: { tarea, contexto },
    })
    if (error || !data?.texto?.trim()) return null
    return { texto: data.texto.trim(), origen: 'ia' }
  } catch {
    // Un fallo de red no puede dejar sin avisar a nadie: se sigue con plantilla.
    return null
  }
}

function clinicaEnSesion(): string {
  return db.get('clinicas')[0]?.nombre ?? 'Su veterinaria'
}

/** A qué número se le manda el informe: el que la clínica dejó registrado. */
export async function contactoAdministracion(): Promise<{ nombre: string; whatsapp: string }> {
  const clinica = db.get('clinicas')[0]
  if (!clinica?.whatsapp) {
    throw new Error('La clínica no tiene un WhatsApp de contacto registrado')
  }
  return { nombre: clinica.responsable, whatsapp: clinica.whatsapp }
}

/** Redacta el mensaje de un aviso concreto. El texto vuelve editable a la pantalla. */
export async function redactarAviso(aviso: Programado): Promise<Redaccion> {
  const clinica = clinicaEnSesion()
  const conIa = await pedirALaIA('aviso', contextoDeAviso(aviso, clinica))
  return conIa ?? { texto: plantillaAviso(aviso, clinica), origen: 'plantilla', motivo: SIN_IA }
}

/** Redacta el resumen del día para el administrador. */
export async function redactarInforme(resumen: ResumenDelDia): Promise<Redaccion> {
  const clinica = clinicaEnSesion()
  const conIa = await pedirALaIA('informe', { clinica, ...resumen })
  return conIa ?? { texto: plantillaInforme(resumen, clinica), origen: 'plantilla', motivo: SIN_IA }
}
