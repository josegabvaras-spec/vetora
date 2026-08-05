/** Convierte el texto de un input numérico a number|null, sin forzar 0 cuando está vacío. */
export function aNumeroOpcional(valor: string): number | null {
  const limpio = valor.trim()
  if (!limpio) return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}
