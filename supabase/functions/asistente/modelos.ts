// Qué modelo atiende cada tarea, y qué cuesta.
//
// ⚠️ **La elección vive aquí, en el servidor, y nunca llega del cuerpo de la
// petición.** Si el cliente pudiera mandar `model`, cualquiera con la clave
// anónima —que viaja dentro del bundle— forzaría el modelo más caro de la
// plataforma. Lo mismo vale para las instrucciones del sistema.

export type Tarea = 'aviso' | 'aviso_interno' | 'informe' | 'copiloto'

export const TAREAS: Tarea[] = ['aviso', 'aviso_interno', 'informe', 'copiloto']

export function esTarea(valor: unknown): valor is Tarea {
  return typeof valor === 'string' && (TAREAS as string[]).includes(valor)
}

/**
 * Modelo por tarea.
 *
 * **Aviso, aviso interno e informe: `claude-haiku-4-5`.** Las tres son
 * redacción o reordenar cifras que ya vienen calculadas — nada que decidir,
 * solo escribirlo bien. Pedirle eso a un modelo de razonamiento es pagar de
 * más por lo mismo.
 *
 * **Copiloto: `claude-sonnet-5`.** Es la única tarea que de verdad razona:
 * decide qué herramienta consultar, en qué orden, y sintetiza el resultado
 * para una pregunta que no tiene forma fija.
 *
 * Existir como mapa es lo que permite este reparto sin tocar nada más — y
 * permite dejar una tarea en un modelo distinto si el elegido no rinde, que es
 * exactamente la clase de decisión que no debe exigir reescribir la función.
 *
 * ⚠️ Haiku 4.5 **no admite `output_config.effort`** — lo rechaza con error, a
 * diferencia de Opus 5 y Sonnet 5. Ver `SOPORTA_EFFORT` más abajo: sin esa
 * comprobación, las tres tareas de aquí fallarían en cuanto se llamaran.
 */
export const MODELO_POR_TAREA: Record<Tarea, string> = {
  aviso: 'claude-haiku-4-5',
  aviso_interno: 'claude-haiku-4-5',
  informe: 'claude-haiku-4-5',
  copiloto: 'claude-sonnet-5',
}

/**
 * Qué modelos admiten `output_config.effort`.
 *
 * Opus 5 y Sonnet 5 sí; Haiku 4.5 no —es de una familia anterior a esa
 * palanca— y lo devuelve como error, no como advertencia. `index.ts` tiene
 * que consultar esto antes de construir la llamada, no asumir que todos los
 * modelos aceptan los mismos parámetros.
 */
const SOPORTA_EFFORT = new Set(['claude-opus-5', 'claude-sonnet-5'])

export function soportaEffort(modelo: string): boolean {
  return SOPORTA_EFFORT.has(modelo)
}

/**
 * Esfuerzo de razonamiento por tarea, para los modelos que lo admiten.
 *
 * ⚠️ Hoy solo se aplica a `copiloto`: las otras tres van en Haiku 4.5, que no
 * tiene esta palanca (ver `soportaEffort()`). El mapa se conserva completo de
 * todos modos, para que volver a subir una tarea a Opus o Sonnet no obligue a
 * inventarle un esfuerzo nuevo — ya lo tiene.
 */
export const ESFUERZO_POR_TAREA: Record<Tarea, 'low' | 'medium' | 'high'> = {
  aviso: 'low',
  aviso_interno: 'low',
  informe: 'medium',
  copiloto: 'medium',
}

/**
 * Tope de tokens de salida por tarea.
 *
 * Un aviso son 2 a 4 frases; una nota interna, 1 a 3; el informe, 3 a 5
 * líneas. Acotarlo no es solo coste: es la red de seguridad frente al límite
 * de salida de cada modelo, que **no es el mismo en todos** —Haiku 4.5 es más
 * bajo que Opus o Sonnet 5— y un `max_tokens` que lo supere es un 400, no un
 * recorte silencioso. El copiloto se queda en el techo de siempre: puede
 * necesitar varias vueltas de herramientas antes de responder.
 */
export const MAX_TOKENS_POR_TAREA: Record<Tarea, number> = {
  aviso: 1024,
  aviso_interno: 1024,
  informe: 2048,
  copiloto: 16000,
}

/**
 * Tarifas en dólares por millón de tokens, para **estimar** el coste.
 *
 * ⚠️ Son una referencia interna de orientación, no una factura: hay que
 * contrastarlas con la página de precios de Anthropic, y actualizarlas cuando
 * cambien. Lo que se registra en `ia_uso.costo_estimado_usd` sirve para saber
 * qué clínica gasta más y si un plan se queda corto — no para cobrarle a nadie.
 *
 * El fallback existe porque un modelo desconocido no puede hacer fallar la
 * respuesta: se registra a cero y se ve en la bitácora que falta su tarifa.
 */
const TARIFAS: Record<string, { entrada: number; salida: number }> = {
  'claude-opus-5': { entrada: 15, salida: 75 },
  'claude-sonnet-5': { entrada: 3, salida: 15 },
  // Sin sufijo de fecha: `claude-haiku-4-5` es el identificador completo.
  'claude-haiku-4-5': { entrada: 1, salida: 5 },
}

/**
 * La entrada no es un número, son tres, y cada una se paga distinto.
 *
 * ⚠️ **`usage.input_tokens` NO incluye los tokens de caché**: la creación y la
 * lectura viajan en campos aparte. La primera versión de esto solo leía
 * `input_tokens`, así que tanto `tokens_entrada` como el coste **quedaban por
 * debajo de lo real** — y lo delató la propia bitácora, con dos llamadas de 92
 * tokens y una de 601 para el mismo tamaño de contexto: la diferencia era el
 * prompt del sistema entrando sin cachear.
 *
 * Hoy son céntimos. Con el copiloto, donde los resultados de las herramientas
 * se cachean, la caché será la mayor parte de la entrada y un contador que la
 * ignore no sirve para nada.
 */
export interface TokensDeEntrada {
  /** Los que no vienen ni van a la caché. */
  frescos: number
  /** Escribir en la caché cuesta más que leer normal: se paga a 1,25×. */
  cacheEscritura: number
  /** Leerla es lo barato, y es el motivo de cachear: 0,1×. */
  cacheLectura: number
}

const MULTIPLICADOR_ESCRITURA = 1.25
const MULTIPLICADOR_LECTURA = 0.1

/** Todo lo que entró, para que `tokens_entrada` signifique lo que dice. */
export function totalDeEntrada(t: TokensDeEntrada): number {
  return t.frescos + t.cacheEscritura + t.cacheLectura
}

export function costoEstimadoUsd(modelo: string, entrada: TokensDeEntrada, salida: number): number {
  const tarifa = TARIFAS[modelo]
  if (!tarifa) return 0

  const costeEntrada =
    entrada.frescos * tarifa.entrada +
    entrada.cacheEscritura * tarifa.entrada * MULTIPLICADOR_ESCRITURA +
    entrada.cacheLectura * tarifa.entrada * MULTIPLICADOR_LECTURA

  const bruto = (costeEntrada + salida * tarifa.salida) / 1_000_000
  // Seis decimales, los mismos que la columna: una consulta cuesta céntimos de
  // céntimo y redondear a dos las contaría todas como cero.
  return Math.round(bruto * 1_000_000) / 1_000_000
}
