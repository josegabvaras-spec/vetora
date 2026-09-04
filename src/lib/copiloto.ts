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
  consultar_vademecum: 'el vademécum de la clínica',
}

/**
 * Seis reformulaciones por categoría, no preguntas nuevas: cada variante la
 * responde la MISMA herramienta y dentro de los límites que esa herramienta
 * acepta, así que ninguna arriesga la respuesta vacía —o el error de
 * parámetro— que gastaría cupo para nada. Los topes reales, de
 * `supabase/functions/asistente/herramientas.ts`:
 *
 * - `obtener_agenda(desde, hasta)`, **máximo 31 días**, y devuelve tipo y
 *   estado de cada cita: por eso hay variantes de mes y de canceladas, y
 *   ninguna de trimestre.
 * - `obtener_clientes_inactivos(dias_sin_visita)`, **entre 30 y 730 días**:
 *   caben desde «tres meses» hasta «más de un año».
 * - `obtener_ventas(desde, hasta)`, **máximo 92 días**, con total, por método
 *   de pago y por día: de ahí las variantes de método y de comparar dos meses.
 * - `obtener_productos_bajo_minimo(limite)` **no recibe fechas**: sus seis
 *   variantes preguntan por el stock de ahora, nunca por un periodo.
 */
const PREGUNTAS_AGENDA = [
  '¿Qué citas tengo hoy?',
  '¿Qué tengo agendado esta semana?',
  '¿Cuántas citas hay programadas para mañana?',
  '¿Cómo viene la agenda de este mes?',
  '¿Qué citas se cancelaron esta semana?',
  '¿De qué tipo son las citas de esta semana?',
]
const PREGUNTAS_PACIENTES_CLINICOS = [
  '¿Qué pacientes no vienen hace más de 6 meses?',
  '¿Qué mascotas están atrasadas en su chequeo?',
  '¿A quién debería contactar para una revisión?',
  '¿Qué pacientes llevan más de un año sin venir?',
  '¿Qué mascotas no vienen desde hace tres meses?',
  '¿A qué pacientes les toca control y no lo han pedido?',
]
const PREGUNTAS_CLIENTES_SIN_HISTORIAL = [
  '¿Qué clientes no vienen hace más de 3 meses?',
  '¿Qué mascotas no vienen hace tiempo?',
  '¿A qué clientes debería recordarles su próxima visita?',
  '¿Qué clientes llevan medio año sin pasar?',
  '¿A qué mascotas ya les toca baño o corte?',
  '¿Qué clientes se están alejando?',
]
const PREGUNTAS_STOCK = [
  '¿Qué productos tengo que reponer?',
  '¿Qué artículos están por agotarse?',
  '¿Qué está por debajo del mínimo ahora mismo?',
  '¿De qué me estoy quedando sin stock?',
  '¿Qué debería incluir en el próximo pedido?',
  '¿Qué productos hay que pedirle al proveedor?',
]
const PREGUNTAS_VENTAS = [
  '¿Cuánto se cobró esta semana?',
  '¿Cómo van las ventas del mes?',
  '¿Cuánto se cobró en efectivo hoy?',
  '¿Qué día de la semana se vende más?',
  '¿Cómo se reparten los cobros por método de pago?',
  '¿Cómo va este mes comparado con el anterior?',
]

/**
 * ⚠️ La categoría no se SUMA a la semilla, se mezcla con ella. Sumando —que es
 * como estaba— las cuatro categorías avanzaban en bloque: al pasar de una
 * semilla a la siguiente, las cuatro saltaban a su variante siguiente a la vez,
 * y de las 6⁴ = 1296 combinaciones posibles solo aparecían **seis**. Con la
 * mezcla, cada categoría elige por su cuenta y salen las 1296.
 */
function elegir(opciones: string[], semilla: number, categoria: number): string {
  // ⚠️ Los tres `>>> 13 / >>> 16` no son adorno: una multiplicación solo empuja
  // la entropía hacia los bits ALTOS, y `% opciones.length` lee los BAJOS. Sin
  // bajarla, semillas seguidas daban resultados correlacionados y de las 1296
  // combinaciones posibles salían 44. Es el finalizador de murmur3.
  let h = Math.imul(semilla ^ Math.imul(categoria + 1, 0x9e3779b1), 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return opciones[(h >>> 0) % opciones.length]
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
 * para que no todas cambien de variante a la vez.
 *
 * ⚠️ **La `semilla` la pone quien llama, y por eso este fichero sigue siendo
 * puro.** Fue primero un contador semanal calculado aquí dentro, y estaba mal
 * pensado: con un periodo de siete días nadie llega a ver una rotación, y ni
 * siquiera se puede comprobar que exista. Ahora `PreguntaleAVetora` genera una
 * semilla **por visita**, así que las sugerencias no se mueven mientras estás
 * en la pantalla —cambiar bajo el dedo sería peor— pero sí al volver a entrar,
 * que es cuando se nota que el copiloto sirve para más de cuatro cosas.
 */
export function atajosDelCopiloto(
  rol: string | undefined,
  modulos: ModuloVetora[] | undefined,
  semilla: number,
): string[] {
  const tiene = (m: ModuloVetora) => !modulos || modulos.includes(m)
  const atajos: string[] = []
  let categoria = 0

  if (tiene('agenda')) atajos.push(elegir(PREGUNTAS_AGENDA, semilla, categoria++))
  if (tiene('historial_clinico')) atajos.push(elegir(PREGUNTAS_PACIENTES_CLINICOS, semilla, categoria++))
  else if (tiene('fichas')) atajos.push(elegir(PREGUNTAS_CLIENTES_SIN_HISTORIAL, semilla, categoria++))
  // ⚠️ PetShop no trae el módulo `inventario` (esa pantalla es solo de
  // clínica/peluquería) pero SÍ guarda su stock en la misma tabla `productos`
  // que ya lee `obtener_productos_bajo_minimo` — sin el `|| tiene('petshop')`
  // esta categoría se perdía para todo plan PetShop aunque la herramienta
  // funcionara bien con sus datos.
  if (tiene('inventario') || tiene('petshop')) atajos.push(elegir(PREGUNTAS_STOCK, semilla, categoria++))
  // Lo que se cobró es del negocio, no del turno de quien atiende.
  if (tiene('caja') && (rol === 'admin' || rol === 'recepcion')) {
    atajos.push(elegir(PREGUNTAS_VENTAS, semilla, categoria++))
  }

  return atajos
}
