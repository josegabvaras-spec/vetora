import { db } from '../mocks/db'
import type { Usuario } from '../types/database'

/**
 * Motivo por el que una cuenta no puede operar. Se comprueba al entrar y en
 * cada render protegido: si suspendes una clínica con la sesión abierta, sus
 * usuarios salen en el acto.
 */
export function motivoDeBloqueo(usuario: Usuario | null): string | null {
  if (!usuario) return null
  if (!usuario.activo) return 'Tu usuario está desactivado. Contacta con el administrador de la clínica.'

  // El usuario de plataforma no pertenece a ninguna clínica: nada que bloquear.
  if (usuario.rol === 'superadmin' || !usuario.clinica_id) return null

  // Lectura global: al entrar todavía no hay clínica fijada en la sesión.
  const clinica = db.getGlobal('clinicas').find((c) => c.id === usuario.clinica_id)
  if (!clinica) return 'La clínica de este usuario ya no existe.'
  if (clinica.estado === 'suspendida') {
    return `La cuenta de ${clinica.nombre} está suspendida. Regulariza el pago para volver a entrar.`
  }
  return null
}
