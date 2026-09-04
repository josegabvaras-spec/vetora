import type { FichaVademecum, UnidadDosificacion } from '../types/database'

/**
 * Helpers puros del vademécum: pasar de un rango en mg/kg a algo que se pueda
 * administrar. Aquí no se toca la red ni el store.
 *
 * ⚠️ **Esto calcula, no receta.** Devuelve el rango que sale de los números que
 * la propia clínica escribió en su ficha, para que un veterinario lo compruebe
 * de un vistazo. Es la misma línea que ya traza `INSTRUCCIONES_COPILOTO`:
 * señalar que algo no cuadra, nunca decir «aplícale X» como si fuera una orden.
 */

export const UNIDAD_LABEL: Record<UnidadDosificacion, string> = {
  ml: 'ml',
  tableta: 'tabletas',
  capsula: 'cápsulas',
  g: 'g',
  gota: 'gotas',
}

export interface DosisCalculada {
  /** Miligramos de principio activo para ese peso. */
  minMg: number
  maxMg: number
  /**
   * El rango ya convertido a lo que se administra, cuando la ficha trae
   * concentración. Sin ella no hay forma de saber cuántos ml son 180 mg.
   */
  minUnidades?: number
  maxUnidades?: number
  unidad: UnidadDosificacion
}

/**
 * Redondeo a dos decimales. Un `3.5999999999999996` en una dosis no es un
 * detalle estético: se lee como precisión que no existe.
 */
function dosDecimales(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * El rango de dosis de esa ficha para ese peso, o `null` si falta el dato.
 *
 * Devuelve `null` en vez de cero cuando la ficha no tiene rango: un cero se
 * leería como «no le des nada», que es una afirmación, mientras que la verdad
 * es «esta ficha no lo dice». Son cosas distintas y no pueden mostrarse igual.
 */
export function dosisParaPeso(ficha: FichaVademecum, pesoKg: number | null | undefined): DosisCalculada | null {
  if (!pesoKg || pesoKg <= 0) return null

  const min = ficha.dosis_min_mg_kg ?? null
  const max = ficha.dosis_max_mg_kg ?? null
  // Con un solo extremo el rango sigue siendo utilizable: se colapsa en un
  // valor único en vez de descartar la ficha entera.
  const desde = min ?? max
  const hasta = max ?? min
  if (desde == null || hasta == null) return null

  const minMg = dosDecimales(desde * pesoKg)
  const maxMg = dosDecimales(hasta * pesoKg)
  const calculada: DosisCalculada = { minMg, maxMg, unidad: ficha.unidad_dosificacion }

  const concentracion = ficha.concentracion_mg ?? null
  if (concentracion && concentracion > 0) {
    calculada.minUnidades = dosDecimales(minMg / concentracion)
    calculada.maxUnidades = dosDecimales(maxMg / concentracion)
  }
  return calculada
}

/** «180 – 270 mg (3,6 – 5,4 ml)», o «180 mg» cuando el rango es un solo valor. */
export function describirDosis(d: DosisCalculada): string {
  const num = (n: number) => n.toLocaleString('es-BO', { maximumFractionDigits: 2 })
  const mg = d.minMg === d.maxMg ? `${num(d.minMg)} mg` : `${num(d.minMg)} – ${num(d.maxMg)} mg`
  if (d.minUnidades == null || d.maxUnidades == null) return mg

  const u = UNIDAD_LABEL[d.unidad]
  const unidades =
    d.minUnidades === d.maxUnidades
      ? `${num(d.minUnidades)} ${u}`
      : `${num(d.minUnidades)} – ${num(d.maxUnidades)} ${u}`
  return `${mg} (${unidades})`
}

/** «Amoxicilina · canino» — la especie es parte de la identidad de la ficha. */
export function rotuloFicha(ficha: FichaVademecum): string {
  return ficha.especie === 'todos' ? ficha.nombre : `${ficha.nombre} · ${ficha.especie}`
}
