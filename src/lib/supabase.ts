import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las variables de entorno de Supabase. Asegúrate de tener configurado el archivo .env')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

export const isMockMode = false;

/**
 * El motivo real de que falle una Edge Function (caducado, ya usado, correo
 * cogido) viaja en el cuerpo de la respuesta; `supabase-js` lo deja en
 * `error.context`, no en `error.message` —que solo dice «non-2xx status code»—.
 *
 * Vive aquí, junto al cliente, porque es interpretación del transporte y no de
 * un dominio: lo usan `invitaciones` y `plataforma` por igual.
 */
export async function motivoDelFallo(error: unknown): Promise<string | null> {
  const contexto = (error as { context?: Response }).context
  if (!contexto || typeof contexto.json !== 'function') return null
  try {
    const cuerpo = await contexto.clone().json()
    return typeof cuerpo?.error === 'string' ? cuerpo.error : null
  } catch {
    return null
  }
}
