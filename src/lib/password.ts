/**
 * Derivación de contraseñas para el modo de demostración.
 *
 * En producción **la aplicación no guarda contraseñas**: las guarda Supabase
 * Auth en `auth.users` (PRD §5.1). Esto existe solo para que el mock se
 * comporte como un login real sin escribir claves en claro en localStorage.
 *
 * PBKDF2-SHA256 con sal por usuario, vía `crypto.subtle`, que está tanto en el
 * navegador como en Node. Contra la fuerza bruta un contador en el cliente no
 * protegería nada: de eso se encarga el límite de intentos de Supabase Auth.
 */

const ITERACIONES = 150_000
const LONGITUD_BITS = 256

function aHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function generarSalt(): string {
  return aHex(crypto.getRandomValues(new Uint8Array(16)).buffer)
}

export async function derivarHash(password: string, salt: string): Promise<string> {
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(salt),
      iterations: ITERACIONES,
      hash: 'SHA-256',
    },
    clave,
    LONGITUD_BITS,
  )
  return aHex(bits)
}

/**
 * Comparación en tiempo constante: comparar hashes con `===` filtra por el
 * tiempo de respuesta cuántos caracteres iniciales coincidían.
 */
export function sonIguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diferencia = 0
  for (let i = 0; i < a.length; i++) {
    diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diferencia === 0
}

export async function verificarHash(password: string, salt: string, hash: string): Promise<boolean> {
  return sonIguales(await derivarHash(password, salt), hash)
}
