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

  // ⚠️ Por RPC y no leyendo `clinicas` directamente. Esta función corre en
  // CADA login, de cualquier rol, y `0052` cerró `clinicas_select` a
  // `auth_es_personal()`: para un `cliente` del portal la consulta pasó a
  // devolver vacío, y el vacío se interpreta abajo como «la clínica ya no
  // existe». Resultado: ningún cliente podía entrar. Los otros lectores de
  // `clinicas` no se enteraron porque son rutas de personal.
  //
  // `clinica_del_portal()` es `security definer` y resuelve la clínica con
  // `auth_clinica_id()`, así que sirve igual para el personal y para el
  // portal — y de paso ya no se puede preguntar por la clínica de otro:
  // el id sale del JWT, no del parámetro.
  const { data, error } = await supabase.rpc('clinica_del_portal')
  const clinica = data?.[0]

  if (error || !clinica) return 'La clínica de este usuario ya no existe.'
  if (clinica.estado === 'suspendida') {
    return `La cuenta de ${clinica.nombre} está suspendida. Regulariza el pago para volver a entrar.`
  }
  return null
}
