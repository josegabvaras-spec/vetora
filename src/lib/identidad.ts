/**
 * Normalización del CI y del WhatsApp para COMPARAR dos registros de la misma
 * persona escritos por manos distintas.
 *
 * Nada de esto reescribe el dato guardado: la ficha conserva lo que tecleó el
 * personal (con su complemento de departamento si lo anotó), que es lo que se
 * imprime en consentimientos y recibos. Estas funciones existen solo para el
 * momento de emparejar.
 *
 * ⚠️ Están DUPLICADAS a propósito en `supabase/functions/registro-portal/`:
 * esa función corre en Deno, fuera del bundle de Vite, y no puede importar de
 * `src/`. Es el mismo criterio que ya siguen `esSuperadmin` en las Edge
 * Functions o el chequeo de «único admin activo» en `eliminar-usuario`. Si
 * cambias una, cambia la otra.
 */

/**
 * Últimos 8 dígitos de un teléfono, que en Bolivia son el número de móvil.
 *
 * Hace que `+591 71234567`, `71234567` y `591-7123-4567` casen entre sí.
 * Devuelve cadena vacía si no hay 8 dígitos, y eso **no casa con nada** — es
 * deliberado: una ficha sin WhatsApp no se puede reclamar.
 */
export function movil(valor: string): string {
  const digitos = valor.replace(/\D/g, '')
  return digitos.length >= 8 ? digitos.slice(-8) : ''
}

/**
 * Número de cédula, sin el complemento ni prefijos.
 *
 * Se queda con **la racha de dígitos más larga**. Las dos versiones anteriores
 * fallaban por lo mismo, cada una por un lado: quedarse con todos los dígitos
 * concatenaba el complemento de un CI reexpedido ("1234567-1A" → "12345671"),
 * y cortar por el primer separador se rompía con cualquier prefijo
 * ("CI 1234567" → "CI" → ""). La racha más larga acierta en los cuatro casos:
 *
 *   "1234567-1A" · "1234567 SC" · "1234567SC" · "CI 1234567"  →  "1234567"
 */
export function cedula(valor: string): string {
  const rachas = valor.match(/\d+/g) ?? []
  return rachas.sort((a, b) => b.length - a.length)[0] ?? ''
}
