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

/**
 * Fija (o reemplaza) la contraseña de una cuenta logueada actualmente.
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
 * Verifica correo y contraseña e inicia sesión.
 */
export async function verificarCredenciales(email: string, password: string): Promise<Usuario> {
  const normalizado = normalizarEmail(email)

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizado,
    password,
  })

  if (error || !data.user) {
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

/**
 * Cambia la contraseña de un usuario logueado, exigiendo la contraseña actual para seguridad.
 */
export async function cambiarMiPassword(usuarioId: string, actual: string, nueva: string): Promise<void> {
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) throw new Error('Usuario no encontrado')

  // Re-autenticar para verificar la contraseña actual
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: authData.user.email!,
    password: actual,
  })

  if (authError) {
    throw new Error('La contraseña actual es incorrecta')
  }

  // Si la actual es correcta, establecemos la nueva
  await establecerPassword(usuarioId, nueva)
}
