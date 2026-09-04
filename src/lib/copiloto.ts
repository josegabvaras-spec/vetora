import type { ModuloVetora } from '../types/database'

/**
 * Helpers puros del copiloto: qué se le puede preguntar y cómo se nombra lo que
 * consultó. Aquí no se toca la red ni el store.
 *
 * Viven en `lib/` y no dentro del componente por el Fast Refresh, igual que
 * `enlacesPeluqueria.ts` y `enlacesPetshop.ts`: un fichero que exporta un
 * componente y además constantes obliga a recargar la página entera al tocar
 * cualquiera de las dos cosas.
 */

/**
 * Cómo se lee cada herramienta cuando se enseña qué se consultó.
 *
 * ⚠️ **Las claves son los nombres de `ESQUEMAS_HERRAMIENTAS` en
 * `supabase/functions/asistente/herramientas.ts`.** Si añades una herramienta
 * allí, ponle aquí su rótulo; si falta, la interfaz enseña el nombre técnico
 * —que es feo pero cierto, y por eso el fallback existe en vez de ocultarla.
 */
export const ETIQUETA_HERRAMIENTA: Record<string, string> = {
  obtener_agenda: 'la agenda',
  buscar_paciente: 'la lista de pacientes',
  obtener_resumen_paciente: 'la ficha del paciente',
  obtener_clientes_inactivos: 'los pacientes sin visitas recientes',
  obtener_ventas: 'los cobros',
  obtener_productos_bajo_minimo: 'el inventario',
}

/**
 * Tres reformulaciones por categoría, no preguntas nuevas: cada variante pide
 * el mismo dato (mismo rango, mismo agrupamiento) que ya cubre su herramienta,
 * solo con otras palabras — así ninguna arriesga la respuesta vacía que
 * `atajosDelCopiloto` ya evitaba antes de que existiera la rotación.
 */
const PREGUNTAS_AGENDA = [
  '¿Qué citas tengo hoy?',
  '¿Qué tengo agendado esta semana?',
  '¿Cuántas citas hay programadas para mañana?',
]
const PREGUNTAS_PACIENTES_CLINICOS = [
  '¿Qué pacientes no vienen hace más de 6 meses?',
  '¿Qué mascotas están atrasadas en su chequeo?',
  '¿A quién debería contactar para una revisión?',
]
const PREGUNTAS_CLIENTES_SIN_HISTORIAL = [
  '¿Qué clientes no vienen hace más de 3 meses?',
  '¿Qué mascotas no vienen hace tiempo?',
  '¿A qué clientes debería recordarles su próxima visita?',
]
const PREGUNTAS_STOCK = [
  '¿Qué productos tengo que reponer?',
  '¿Qué artículos están por agotarse?',
  '¿Qué me conviene pedir esta semana?',
]
const PREGUNTAS_VENTAS = [
  '¿Cuánto se cobró esta semana?',
  '¿Cómo van las ventas del mes?',
  '¿Cuánto se cobró en efectivo hoy?',
]

/**
 * Un contador que sube cada 7 días desde epoch — no el número de semana ISO,
 * no hace falta alinear con el calendario, solo que cambie con regularidad.
 * Determinista a propósito: la misma persona ve las mismas sugerencias toda
 * la semana (cambiar en cada visita se leería como al azar, no como
 * variedad), y cambian solas la semana siguiente sin guardar nada en ningún
 * lado — no hay `Math.random()` en este fichero ni ningún otro de `lib/`.
 */
function semanaDeRotacion(): number {
  return Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000))
}

function elegir(opciones: string[], semilla: number): string {
  return opciones[((semilla % opciones.length) + opciones.length) % opciones.length]
}

/**
 * Los accesos rápidos, según lo que esa persona puede ver.
 *
 * No es cosmética: ofrecer «¿cómo van mis ventas?» a quien no tiene el módulo
 * de caja es prometer una respuesta que la RLS va a dejar vacía, y el copiloto
 * tendría que contestar que no encontró nada. Es peor que no ofrecerlo.
 *
 * ⚠️ El número de sugerencias es el mismo de siempre — una por categoría que
 * aplique, nunca más de cuatro—; lo único que rota es CUÁL frase de esa
 * categoría se muestra. `categoria++` desplaza la semilla entre categorías
 * para que no todas cambien de variante el mismo día a la vez.
 */
export function atajosDelCopiloto(
  rol: string | undefined,
  modulos: ModuloVetora[] | undefined,
): string[] {
  const tiene = (m: ModuloVetora) => !modulos || modulos.includes(m)
  const semana = semanaDeRotacion()
  const atajos: string[] = []
  let categoria = 0

  if (tiene('agenda')) atajos.push(elegir(PREGUNTAS_AGENDA, semana + categoria++))
  if (tiene('historial_clinico')) atajos.push(elegir(PREGUNTAS_PACIENTES_CLINICOS, semana + categoria++))
  else if (tiene('fichas')) atajos.push(elegir(PREGUNTAS_CLIENTES_SIN_HISTORIAL, semana + categoria++))
  // ⚠️ PetShop no trae el módulo `inventario` (esa pantalla es solo de
  // clínica/peluquería) pero SÍ guarda su stock en la misma tabla `productos`
  // que ya lee `obtener_productos_bajo_minimo` — sin el `|| tiene('petshop')`
  // esta categoría se perdía para todo plan PetShop aunque la herramienta
  // funcionara bien con sus datos.
  if (tiene('inventario') || tiene('petshop')) atajos.push(elegir(PREGUNTAS_STOCK, semana + categoria++))
  // Lo que se cobró es del negocio, no del turno de quien atiende.
  if (tiene('caja') && (rol === 'admin' || rol === 'recepcion')) {
    atajos.push(elegir(PREGUNTAS_VENTAS, semana + categoria++))
  }

  return atajos
}
