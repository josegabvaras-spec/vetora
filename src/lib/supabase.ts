import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * true cuando no hay credenciales de Supabase configuradas en `.env`.
 * En ese caso la app funciona con datos mock (ver src/mocks) para poder
 * previsualizar el MVP sin depender de un proyecto de Supabase real.
 */
export const isMockMode = !supabaseUrl || !supabaseAnonKey

export const supabase = isMockMode
  ? null
  : createClient(supabaseUrl!, supabaseAnonKey!)
