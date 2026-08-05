import { db, newId } from '../mocks/db'
import { derivarHash, generarSalt, verificarHash } from '../lib/password'
import type { Usuario } from '../types/database'

/**
 * Cuentas de acceso. En producción esto es Supabase Auth
 * (`supabase.auth.signInWithPassword`) y la aplicación nunca ve una contraseña;
 * aquí se simula sobre la tabla `credenciales` para poder previsualizar el
 * login sin un proyecto real.
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
export function emailDisponible(email: string, ignorarUsuarioId?: string): boolean {
  const normalizado = normalizarEmail(email)
  return !db.getGlobal('usuarios').some((u) => u.id !== ignorarUsuarioId && normalizarEmail(u.email) === normalizado)
}

export function exigirEmailLibre(email: string, ignorarUsuarioId?: string): string {
  const normalizado = validarEmail(email)
  if (!emailDisponible(normalizado, ignorarUsuarioId)) {
    throw new Error('Ya hay una cuenta con ese correo electrónico')
  }
  return normalizado
}

/** Un usuario recién creado todavía no tiene contraseña: la fija con su enlace. */
export function tienePassword(usuarioId: string): boolean {
  return db.getGlobal('credenciales').some((c) => c.usuario_id === usuarioId)
}

const MINIMO = 8

function validarPassword(password: string, email: string) {
  if (password.length < MINIMO) {
    throw new Error(`La contraseña debe tener al menos ${MINIMO} caracteres`)
  }
  if (normalizarEmail(password) === normalizarEmail(email)) {
    throw new Error('La contraseña no puede ser tu propio correo')
  }
}

/**
 * Fija (o reemplaza) la contraseña de una cuenta. Reemplazarla invalida la
 * anterior, que es lo que hace que reenviar el enlace sirva como recuperación.
 */
export async function establecerPassword(usuarioId: string, password: string): Promise<void> {
  const usuario = db.getGlobal('usuarios').find((u) => u.id === usuarioId)
  if (!usuario) throw new Error('Usuario no encontrado')
  validarPassword(password, usuario.email)

  const salt = generarSalt()
  const hash = await derivarHash(password, salt)
  const anterior = db.getGlobal('credenciales').find((c) => c.usuario_id === usuarioId)

  const credencial = {
    id: anterior?.id ?? newId('credencial'),
    usuario_id: usuarioId,
    email: normalizarEmail(usuario.email),
    salt,
    hash,
    actualizada_at: new Date().toISOString(),
  }

  db.set('credenciales', [
    ...db.getGlobal('credenciales').filter((c) => c.usuario_id !== usuarioId),
    credencial,
  ])
}

/**
 * Verifica correo y contraseña. El mensaje es **el mismo** para un correo que no
 * existe y para una contraseña equivocada: distinguirlos permitiría averiguar
 * qué correos tienen cuenta.
 */
export async function verificarCredenciales(email: string, password: string): Promise<Usuario> {
  const generico = new Error('Correo o contraseña incorrectos')
  const normalizado = normalizarEmail(email)

  const credencial = db.getGlobal('credenciales').find((c) => normalizarEmail(c.email) === normalizado)
  if (!credencial) throw generico
  if (!(await verificarHash(password, credencial.salt, credencial.hash))) throw generico

  const usuario = db.getGlobal('usuarios').find((u) => u.id === credencial.usuario_id)
  if (!usuario) throw generico
  return usuario
}
