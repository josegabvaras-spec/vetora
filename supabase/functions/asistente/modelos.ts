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
 * De momento las cuatro apuntan a `claude-opus-5`, que es lo que el código ya
 * usaba: esta fase cambia la seguridad y el control de coste, **no el
 * comportamiento del modelo**. La fase 5 baja las tres primeras a Sonnet 5 y
 * mide la diferencia en el texto de los avisos antes de darlo por bueno.
 *
 * Existir ya como mapa es lo que permite ese cambio sin tocar nada más — y
 * permite también dejar una tarea en Opus si Sonnet la empeora, que es
 * exactamente la clase de decisión que no debe exigir reescribir la función.
 */
export const MODELO_POR_TAREA: Record<Tarea, string> = {
  aviso: 'claude-opus-5',
  aviso_interno: 'claude-opus-5',
  informe: 'claude-opus-5',
  copiloto: 'claude-opus-5',
}

/**
 * Esfuerzo de razonamiento por tarea.
 *
 * Redactar cuatro frases no da para más, y esto se llama una vez por aviso: la
 * diferencia se nota en la factura. El copiloto sí razona —decide qué
 * herramienta consultar y cómo encadenarla—, así que va más alto.
 */
export const ESFUERZO_POR_TAREA: Record<Tarea, 'low' | 'medium' | 'high'> = {
  aviso: 'low',
  aviso_interno: 'low',
  informe: 'medium',
  copiloto: 'medium',
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
  'claude-haiku-4-5-20251001': { entrada: 1, salida: 5 },
}

export function costoEstimadoUsd(modelo: string, entrada: number, salida: number): number {
  const tarifa = TARIFAS[modelo]
  if (!tarifa) return 0
  const bruto = (entrada * tarifa.entrada + salida * tarifa.salida) / 1_000_000
  // Seis decimales, los mismos que la columna: una consulta cuesta céntimos de
  // céntimo y redondear a dos las contaría todas como cero.
  return Math.round(bruto * 1_000_000) / 1_000_000
}
