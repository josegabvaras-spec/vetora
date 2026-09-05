// PRD §5.2: "Moneda: Bolivianos (Bs.) con dos decimales."
//
// Es la moneda de la clínica: consultas, productos, caja y recibos. Quien paga
// ahí es un dueño de mascota en Bolivia.
export function formatBs(amount: number): string {
  return `Bs. ${amount.toFixed(2)}`
}

/**
 * Dólares. **Solo para la suscripción de las clínicas a la plataforma.**
 *
 * Lo que sostiene Vetora —dominio, Supabase, Vercel— se paga en dólares y sus
 * tarifas se mueven, así que el precio del plan se fija en dólares y se cobra
 * al cambio del día.
 *
 * Es una función aparte de `formatBs` a propósito: una sola con un parámetro de
 * moneda es exactamente cómo se acaba imprimiendo «Bs.» sobre un importe en
 * dólares el día que alguien olvida pasarlo.
 */
export function formatUsd(amount: number): string {
  return `USD ${amount.toFixed(2)}`
}

/**
 * Igual que `formatUsd`, pero con cuatro decimales — para un costo por
 * unidad, no un total. Un aviso en Haiku cuesta del orden de USD 0.0006: con
 * dos decimales `formatUsd` lo mostraría como "USD 0.00" y parecería gratis
 * cuando no lo es.
 */
export function formatUsdPreciso(amount: number): string {
  return `USD ${amount.toFixed(4)}`
}

/** Convierte el precio de la suscripción a lo que se cobra en bolivianos. */
export function usdABs(montoUsd: number, tipoCambio: number): number {
  return Number((montoUsd * tipoCambio).toFixed(2))
}
