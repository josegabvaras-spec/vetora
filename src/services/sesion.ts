import { supabase } from '../lib/supabase'
import type { Usuario } from '../types/database'

/**
 * Motivo por el que una cuenta no puede operar.
 */
export async function motivoDeBloqueo(usuario: Usuario | null): Promise<string | null> {
  if (!usuario) return null
  if (!usuario.activo) return 'Tu usuario está desactivado. Contacta con el administrador de la clínica.'

  // El usuario de plataforma no pertenece a ninguna clínica: nada que bloquear.
  if (usuario.rol === 'superadmin' || !usuario.clinica_id) return null

  const { data: clinica, error } = await supabase
    .from('clinicas')
    .select('id, estado, nombre')
    .eq('id', usuario.clinica_id)
    .single()

  if (error || !clinica) return 'La clínica de este usuario ya no existe.'
  if (clinica.estado === 'suspendida') {
    return `La cuenta de ${clinica.nombre} está suspendida. Regulariza el pago para volver a entrar.`
  }
  return null
}
