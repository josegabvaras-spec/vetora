import { db, newId } from '../mocks/db'
import { establecerPassword } from './cuentas'
import type { Invitacion, Usuario } from '../types/database'

function delay<T>(value: T): Promise<T> {
  return Promise.resolve(value)
}

/** Días que vive un enlace de acceso antes de caducar. */
const DIAS_VIGENCIA = 7

/**
 * Un enlace enviado por WhatsApp queda escrito en un chat para siempre: si no
 * caducara ni se gastara al usarse, sería una llave permanente circulando por
 * mensajería. Por eso cada invitación es de **un solo uso** y con caducidad.
 * En producción esto lo emite Supabase Auth (invite / magic link); aquí se
 * modela con la misma semántica.
 */
function generarToken(): string {
  return crypto.randomUUID().replaceAll('-', '')
}

export function invitacionVigenteDe(usuarioId: string): Invitacion | undefined {
  const ahora = Date.now()
  return db
    .getGlobal('invitaciones')
    .filter((i) => i.usuario_id === usuarioId && !i.usado_at && new Date(i.expira_at).getTime() > ahora)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
}

/** Última invitación emitida a un usuario, esté como esté (para mostrar estado). */
export function ultimaInvitacionDe(usuarioId: string): Invitacion | undefined {
  return db
    .getGlobal('invitaciones')
    .filter((i) => i.usuario_id === usuarioId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
}

/**
 * Emite un acceso para el usuario. Si ya tiene uno vigente sin usar lo
 * reutiliza, para que reenviar el mensaje no invalide el enlace que la persona
 * quizá ya tiene abierto.
 */
export async function crearInvitacion(usuarioId: string): Promise<Invitacion> {
  const usuario = db.getGlobal('usuarios').find((u) => u.id === usuarioId)
  if (!usuario) throw new Error('Usuario no encontrado')
  if (!usuario.clinica_id) throw new Error('El usuario de plataforma no recibe enlaces de acceso')
  if (!usuario.activo) throw new Error('El usuario está desactivado: actívalo antes de enviarle el acceso')
  if (!usuario.whatsapp.trim()) throw new Error('El usuario no tiene WhatsApp registrado')

  const vigente = invitacionVigenteDe(usuarioId)
  if (vigente) return delay(vigente)

  const expira = new Date()
  expira.setDate(expira.getDate() + DIAS_VIGENCIA)

  const invitacion: Invitacion = {
    id: newId('invitacion'),
    clinica_id: usuario.clinica_id,
    usuario_id: usuarioId,
    token: generarToken(),
    expira_at: expira.toISOString(),
    enviado_at: null,
    usado_at: null,
    created_at: new Date().toISOString(),
  }
  db.set('invitaciones', [...db.getGlobal('invitaciones'), invitacion])
  return delay(invitacion)
}

export function enlaceDeAcceso(token: string): string {
  const base = typeof window === 'undefined' ? 'https://vetora.app' : window.location.origin
  return `${base}/acceso/${token}`
}

export function mensajeDeAcceso(usuario: Usuario, clinicaNombre: string, enlace: string): string {
  return [
    `Hola ${usuario.nombre}, te damos la bienvenida a Vetora.`,
    `Ya puedes entrar al sistema de ${clinicaNombre} con este enlace:`,
    enlace,
    `El enlace es personal, se usa una sola vez y caduca en ${DIAS_VIGENCIA} días.`,
  ].join('\n\n')
}

/**
 * Marca que el acceso ya se mandó. No consume la cuota mensual de la clínica:
 * es un mensaje de la plataforma para dar de alta a alguien, no un recordatorio
 * de cita del inquilino.
 */
export async function marcarInvitacionEnviada(invitacionId: string): Promise<void> {
  db.set(
    'invitaciones',
    db
      .getGlobal('invitaciones')
      .map((i) => (i.id === invitacionId ? { ...i, enviado_at: new Date().toISOString() } : i)),
  )
  return delay(undefined)
}

export interface AccesoResuelto {
  usuario: Usuario
  clinica_nombre: string
}

/**
 * Comprueba que el enlace sirve, **sin gastarlo**: entre abrirlo y terminar hay
 * un formulario para crear la contraseña, y quien lo abre y se lo piensa no
 * puede perder el acceso por ello.
 */
export async function validarInvitacion(token: string): Promise<AccesoResuelto> {
  const invitacion = db.getGlobal('invitaciones').find((i) => i.token === token)
  if (!invitacion) throw new Error('Este enlace de acceso no es válido.')
  if (invitacion.usado_at) {
    throw new Error('Este enlace ya se usó. Pide uno nuevo a quien te dio de alta.')
  }
  if (new Date(invitacion.expira_at).getTime() <= Date.now()) {
    throw new Error('Este enlace caducó. Pide uno nuevo a quien te dio de alta.')
  }

  const usuario = db.getGlobal('usuarios').find((u) => u.id === invitacion.usuario_id)
  if (!usuario || !usuario.activo) throw new Error('La cuenta de este enlace ya no está habilitada.')

  const clinica = db.getGlobal('clinicas').find((c) => c.id === invitacion.clinica_id)
  if (!clinica) throw new Error('La clínica de este enlace ya no existe.')
  if (clinica.estado === 'suspendida') {
    throw new Error(`La cuenta de ${clinica.nombre} está suspendida.`)
  }

  return delay({ usuario, clinica_nombre: clinica.nombre })
}

/**
 * Fija la contraseña de la cuenta y gasta el enlace. Se vuelve a validar aquí
 * —no solo al abrir la pantalla— porque entre una cosa y otra la clínica puede
 * haberse suspendido o el enlace haberse usado desde otro dispositivo.
 */
export async function establecerPasswordConInvitacion(
  token: string,
  password: string,
): Promise<AccesoResuelto> {
  const resuelto = await validarInvitacion(token)
  await establecerPassword(resuelto.usuario.id, password)

  db.set(
    'invitaciones',
    db
      .getGlobal('invitaciones')
      .map((i) => (i.token === token ? { ...i, usado_at: new Date().toISOString() } : i)),
  )

  return delay(resuelto)
}
