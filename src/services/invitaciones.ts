import { supabase } from '../lib/supabase'
import type { Invitacion, Usuario } from '../types/database'

/** Días que vive un enlace de acceso antes de caducar. */
const DIAS_VIGENCIA = 7

function generarToken(): string {
  return crypto.randomUUID().replaceAll('-', '')
}

export async function invitacionVigenteDe(usuarioId: string): Promise<Invitacion | undefined> {
  const { data } = await supabase
    .from('invitaciones')
    .select('*')
    .eq('usuario_id', usuarioId)
    .is('usado_at', null)
    .gt('expira_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)

  return data?.[0] as Invitacion | undefined
}

export async function ultimaInvitacionDe(usuarioId: string): Promise<Invitacion | undefined> {
  const { data } = await supabase
    .from('invitaciones')
    .select('*')
    .eq('usuario_id', usuarioId)
    .order('created_at', { ascending: false })
    .limit(1)

  return data?.[0] as Invitacion | undefined
}

export async function crearInvitacion(usuarioId: string): Promise<Invitacion> {
  const { data: usuario } = await supabase.from('usuarios').select('*').eq('id', usuarioId).single()
  if (!usuario) throw new Error('Usuario no encontrado')
  if (!usuario.clinica_id) throw new Error('El usuario de plataforma no recibe enlaces de acceso')
  if (!usuario.activo) throw new Error('El usuario está desactivado: actívalo antes de enviarle el acceso')
  if (!usuario.whatsapp?.trim()) throw new Error('El usuario no tiene WhatsApp registrado')

  const vigente = await invitacionVigenteDe(usuarioId)
  if (vigente) return vigente

  const expira = new Date()
  expira.setDate(expira.getDate() + DIAS_VIGENCIA)

  const { data: invitacion, error } = await supabase
    .from('invitaciones')
    .insert({
      clinica_id: usuario.clinica_id,
      usuario_id: usuarioId,
      token: generarToken(),
      expira_at: expira.toISOString(),
    } as any)
    .select()
    .single()

  if (error || !invitacion) throw new Error(`Error al crear invitación: ${error?.message || 'desconocido'}`)
  return invitacion as Invitacion
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

export async function marcarInvitacionEnviada(invitacionId: string): Promise<void> {
  const { error } = await supabase
    .from('invitaciones')
    .update({ enviado_at: new Date().toISOString() })
    .eq('id', invitacionId)

  if (error) throw new Error(`Error al marcar invitación como enviada: ${error.message}`)
}

/** Lo justo para saludar a la persona y enseñarle qué cuenta va a estrenar. */
export interface CuentaDeAcceso {
  id: string
  nombre: string
  email: string
}

export interface AccesoResuelto {
  usuario: CuentaDeAcceso
  clinica_nombre: string
}

/** Ya con sesión abierta: aquí sí se conoce la fila completa del usuario. */
export interface AccesoAbierto {
  usuario: Usuario
  clinica_nombre: string
}

/**
 * Quien abre el enlace todavía no tiene sesión, así que para las RLS es un
 * anónimo y no puede leer ni su propia invitación. Validar y fijar la
 * contraseña viven en la Edge Function `acceso`, que usa la `service_role`.
 */
async function invocarAcceso(cuerpo: Record<string, unknown>): Promise<AccesoResuelto> {
  const { data, error } = await supabase.functions.invoke<AccesoResuelto & { error?: string }>('acceso', {
    body: cuerpo,
  })

  if (error) throw new Error((await motivoDelFallo(error)) ?? 'No se pudo abrir el acceso')
  if (!data || data.error) throw new Error(data?.error ?? 'No se pudo abrir el acceso')

  return { usuario: data.usuario, clinica_nombre: data.clinica_nombre }
}

/**
 * El motivo real (caducado, ya usado, cuenta desactivada) viaja en el cuerpo de
 * la respuesta; `supabase-js` lo deja en `context`, no en `error.message`.
 */
async function motivoDelFallo(error: unknown): Promise<string | null> {
  const contexto = (error as { context?: Response }).context
  if (!contexto || typeof contexto.json !== 'function') return null
  try {
    const cuerpo = await contexto.clone().json()
    return typeof cuerpo?.error === 'string' ? cuerpo.error : null
  } catch {
    return null
  }
}

/** Abrir la pantalla no gasta el enlace; lo gasta crear la contraseña. */
export async function validarInvitacion(token: string): Promise<AccesoResuelto> {
  return await invocarAcceso({ accion: 'validar', token })
}

export async function establecerPasswordConInvitacion(
  token: string,
  password: string,
): Promise<AccesoAbierto> {
  const resuelto = await invocarAcceso({ accion: 'establecer', token, password })

  // La contraseña ya está puesta, pero el navegador sigue sin sesión: sin este
  // inicio, las RLS seguirían viéndolo como anónimo y la aplicación saldría vacía.
  const { error } = await supabase.auth.signInWithPassword({
    email: resuelto.usuario.email,
    password,
  })
  if (error) throw new Error('Se creó la contraseña, pero no se pudo iniciar sesión. Entra desde el inicio de sesión.')

  const { data: usuario } = await supabase.from('usuarios').select('*').eq('id', resuelto.usuario.id).single()
  if (!usuario) throw new Error('No se encontró el perfil del usuario')

  return { usuario: usuario as Usuario, clinica_nombre: resuelto.clinica_nombre }
}
