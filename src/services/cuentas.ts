import { supabase } from '../lib/supabase'
import type { Usuario } from '../types/database'

/**
 * Cuentas de acceso utilizando Supabase Auth real.
 */

/** El correo se guarda y se compara normalizado: nadie escribe siempre igual. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase()
}

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validarEmail(email: string): string {
  const normalizado = normalizarEmail(email)
  if (!FORMATO_EMAIL.test(normalizado)) {
    throw new Error('El correo electrónico no tiene un formato válido')
  }
  return normalizado
}

/** El correo identifica la cuenta en todo el sistema, no dentro de una clínica. */
export async function emailDisponible(email: string, ignorarUsuarioId?: string): Promise<boolean> {
  const normalizado = normalizarEmail(email)
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, email')
    .eq('email', normalizado)
  
  if (error) throw new Error(error.message)
  return !data.some((u) => u.id !== ignorarUsuarioId)
}

export async function exigirEmailLibre(email: string, ignorarUsuarioId?: string): Promise<string> {
  const normalizado = validarEmail(email)
  const disponible = await emailDisponible(normalizado, ignorarUsuarioId)
  if (!disponible) {
    throw new Error('Ya hay una cuenta con ese correo electrónico')
  }
  return normalizado
}

// Aquí vivía `tienePassword()`, que devolvía `true` para todo el mundo. El
// panel de plataforma lo usaba para decidir si una cuenta estaba activa, así
// que enseñaba "Cuenta activa" en verde para todos —incluidos quienes nunca
// canjearon su enlace—, y el superadmin no tenía forma de saber a quién le
// faltaba el acceso.
//
// No se puede arreglar tal cual: desde el navegador no hay manera de consultar
// si una cuenta de Supabase Auth tiene contraseña propia. Y `crearUsuario` da
// de alta con una contraseña aleatoria, así que "tener contraseña" tampoco
// distinguiría nada. Lo que sí es observable, y es lo que de verdad importa, es
// si la persona canjeó su invitación: `invitaciones.usado_at`. Ese estado lo
// deriva ahora `estadoDeLaCuenta` en ClinicaDetalleModal.

/**
 * Longitud mínima de contraseña. Se exporta para que los formularios validen
 * con el mismo número que el servicio: los de acceso y registro del portal
 * prometían "al menos 8 caracteres" en el placeholder sin comprobarlo, así que
 * la persona se enteraba del requisito con un error tras el viaje al servidor
 * (y en el registro del portal, a veces en inglés desde Supabase Auth).
 */
export const PASSWORD_MINIMO = 8

function validarPassword(password: string, email: string) {
  if (password.length < PASSWORD_MINIMO) {
    throw new Error(`La contraseña debe tener al menos ${PASSWORD_MINIMO} caracteres`)
  }
  if (normalizarEmail(password) === normalizarEmail(email)) {
    throw new Error('La contraseña no puede ser tu propio correo')
  }
}

/** Adonde lleva el enlace del correo de recuperación. */
export const RUTA_NUEVA_PASSWORD = '/nueva-password'

/**
 * Manda el correo con el enlace para poner una contraseña nueva.
 *
 * **No dice si el correo existe, y es deliberado.** Responder «esa cuenta no
 * está registrada» convertiría este formulario en un comprobador de qué correos
 * tienen cuenta, que es justo lo que Supabase evita al no distinguir usuario de
 * contraseña en el login. Por eso tampoco se propaga el error de Auth: quien lo
 * use verá siempre el mismo mensaje.
 *
 * `redirectTo` sale de `window.location.origin`, así que **cada dirección desde
 * la que se use la aplicación tiene que estar en la lista de Redirect URLs de
 * Supabase**; si no, el enlace del correo llega y no lleva a ninguna parte.
 */
export async function solicitarRecuperacion(email: string): Promise<void> {
  const normalizado = normalizarEmail(email)
  if (!normalizado) throw new Error('Escribe tu correo electrónico')
  validarEmail(normalizado)

  await supabase.auth.resetPasswordForEmail(normalizado, {
    redirectTo: `${window.location.origin}${RUTA_NUEVA_PASSWORD}`,
  })
}

/**
 * Fija (o reemplaza) la contraseña de una cuenta logueada actualmente.
 *
 * Sirve tanto para el canje del enlace de alta como para la recuperación por
 * correo: la sesión que crea el enlace de recuperación es una sesión normal
 * para todo lo que aquí importa.
 */
export async function establecerPassword(_usuarioId: string, password: string): Promise<void> {
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) throw new Error('No hay sesión activa')
  validarPassword(password, authData.user.email!)

  const { error } = await supabase.auth.updateUser({
    password: password
  })
  
  if (error) throw new Error(error.message)
}

/**
 * Auth marca este caso con `code`, pero las versiones antiguas solo traían el
 * mensaje en inglés; se miran los dos para no depender de cuál responda.
 */
function esCorreoSinConfirmar(error: unknown): boolean {
  const fallo = error as { code?: string; message?: string } | null
  if (!fallo) return false
  return (
    fallo.code === 'email_not_confirmed' ||
    (fallo.message ?? '').toLowerCase().includes('email not confirmed')
  )
}

/**
 * Verifica correo y contraseña e inicia sesión.
 */
export async function verificarCredenciales(email: string, password: string): Promise<Usuario> {
  const normalizado = normalizarEmail(email)

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizado,
    password,
  })

  if (error || !data.user) {
    // Con «Confirm email» activo en Auth, una cuenta sin confirmar rechaza la
    // contraseña **aunque sea correcta**. Decir "incorrectos" manda a la persona
    // a reintentarla una y otra vez; las cuentas que nacen del enlace de acceso
    // o del registro del portal ya vienen confirmadas, así que esto solo
    // aparece en las creadas a mano desde el panel de Supabase.
    if (esCorreoSinConfirmar(error)) {
      throw new Error(
        'Esta cuenta todavía no tiene el correo confirmado. Entra con tu enlace de acceso o pide que te envíen uno nuevo.',
      )
    }
    throw new Error('Correo o contraseña incorrectos')
  }

  const { data: usuario, error: userError } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', data.user.id)
    .single()

  if (userError || !usuario) {
    // La contraseña era correcta, así que hay sesión abierta; sin cerrarla
    // quedaría un JWT autenticado y huérfano, válido contra la API.
    await supabase.auth.signOut()
    throw new Error('No se encontró el perfil del usuario')
  }

  return usuario as Usuario
}
