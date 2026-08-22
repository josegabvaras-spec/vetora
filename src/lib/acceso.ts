import { formatClinicDateTime } from './datetime'
import type { Invitacion } from '../types/database'

/**
 * En qué punto está la cuenta de alguien a quien se dio de alta.
 *
 * Una cuenta no queda utilizable al crearla: hace falta que la persona canjee
 * su enlace y ponga contraseña. Entre medias hay tres situaciones distintas
 * —enlace sin generar, generado pero sin enviar, y caducado— y confundirlas
 * lleva a reenviar lo que no toca.
 *
 * Vivía dentro de `ClinicaDetalleModal`; se saca aquí porque el asistente de la
 * plataforma necesita exactamente lo mismo y duplicarla las haría divergir.
 */
export function estadoDeLaCuenta(invitacion: Invitacion | undefined): { texto: string; activa: boolean } {
  if (invitacion?.usado_at) {
    return {
      texto: `Cuenta activa desde el ${formatClinicDateTime(invitacion.usado_at)}`,
      activa: true,
    }
  }

  if (!invitacion) return { texto: 'Sin acceso · enlace sin generar', activa: false }
  if (new Date(invitacion.expira_at).getTime() <= Date.now()) {
    return { texto: 'Sin acceso · su enlace caducó', activa: false }
  }
  if (invitacion.enviado_at) {
    return { texto: `Sin acceso · enviado el ${formatClinicDateTime(invitacion.enviado_at)}`, activa: false }
  }
  return { texto: 'Sin acceso · enlace generado, sin enviar', activa: false }
}
