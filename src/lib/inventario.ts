/**
 * Conversión entre las dos unidades del inventario (migración 0013).
 *
 *   `productos.stock_actual`          → ENVASES, con fracción (2.9 frascos)
 *   `movimientos_inventario.cantidad` → unidad de medida (5 ml)
 *
 * En la base convierte el trigger; aquí se convierte para lo que se enseña y
 * para los avisos tempranos de "stock insuficiente".
 */

/** Un producto mal cargado con contenido 0 se trata como 1: dosis = envase. */
function contenidoSeguro(contenidoPresentacion: number): number {
  return Number.isFinite(contenidoPresentacion) && contenidoPresentacion > 0 ? contenidoPresentacion : 1
}

/** Cuánta sustancia queda en total (ml, g) sumando envases enteros y fracciones. */
export function dosisDisponible(producto: { stock_actual: number; contenido_presentacion: number }): number {
  return producto.stock_actual * contenidoSeguro(producto.contenido_presentacion)
}

/** Envases que representa una dosis: 5 ml de un frasco de 50 son 0.1 envases. */
export function envasesDesdeDosis(dosis: number, contenidoPresentacion: number): number {
  return dosis / contenidoSeguro(contenidoPresentacion)
}

/** Dosis que contienen esos envases: 0.1 frascos de 50 ml son 5 ml. */
export function dosisDesdeEnvases(envases: number, contenidoPresentacion: number): number {
  return envases * contenidoSeguro(contenidoPresentacion)
}

/**
 * Envases para mostrar, sin la cola de decimales del float.
 *
 * `0.1 + 0.2` no es `0.3` en coma flotante y el stock acababa enseñando
 * "2.9000000000000004 envases". Dos decimales bastan para leerlo; el valor
 * guardado conserva los cuatro de la columna.
 */
export function formatEnvases(envases: number): string {
  return (Math.round(envases * 100) / 100).toString()
}

/** Igual que `formatEnvases`, para una cantidad en la unidad de medida. */
export function formatDosis(dosis: number): string {
  return (Math.round(dosis * 100) / 100).toString()
}
