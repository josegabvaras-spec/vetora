/** Tamaño de página: `max_rows` de PostgREST (`supabase/config.toml`). */
export const PAGINA = 1000

/**
 * Trae TODAS las filas de una consulta, por páginas.
 *
 * PostgREST corta en `max_rows = 1000` **sin error y sin ninguna señal**: la
 * consulta devuelve mil filas y parece completa. Esto ya causó cifras mal
 * calculadas en `metricas.ts` y clínicas/usuarios que desaparecían en
 * `plataforma.ts` — cualquier tabla que pueda superar ese tamaño necesita
 * pasar por aquí en vez de un `select('*')` suelto.
 *
 * `consulta` se pasa como fábrica porque un `PostgrestFilterBuilder` es
 * "thenable" de un solo uso: reutilizarlo entre páginas no vuelve a consultar.
 *
 * La fila llega sin tipar y se afirma como `T` en la frontera: el tipo
 * generado en `types/supabase.ts` ensancha las uniones de literales, así que
 * casarlos aquí no aportaría seguridad, solo ruido.
 */
export async function traerTodo<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const acumulado: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1)
    if (error) {
      throw new Error((error as { message?: string }).message ?? 'No se pudieron cargar los datos')
    }
    const pagina = (data ?? []) as T[]
    acumulado.push(...pagina)
    if (pagina.length < PAGINA) return acumulado
  }
}
