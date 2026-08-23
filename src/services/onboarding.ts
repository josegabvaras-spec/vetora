import { supabase } from '../lib/supabase'
import { VERSION_ONBOARDING } from '../lib/onboarding'

/**
 * Estado del tour de bienvenida (migración 0022).
 *
 * Vive en `onboarding_usuario`, una tabla **aparte de `usuarios`** por un motivo
 * de seguridad que la migración explica: la RLS es por fila, no por columna, así
 * que dejar a alguien escribir su propia fila de `usuarios` le dejaría también
 * cambiarse el `rol`.
 */

export interface EstadoOnboarding {
  completado: boolean
  version: number
}

/** Nadie lo ha visto todavía: es lo que se asume si no hay fila o falla la lectura. */
const SIN_VER: EstadoOnboarding = { completado: false, version: 0 }

/**
 * Si a esta persona le toca ver el tour automáticamente.
 *
 * No basta con `completado`: al subir `VERSION_ONBOARDING` hay que volver a
 * enseñarlo aunque ya lo hubiera visto entero.
 */
export function debeVerElTour(estado: EstadoOnboarding): boolean {
  return !estado.completado || estado.version < VERSION_ONBOARDING
}

/**
 * Lee el estado del usuario de la sesión.
 *
 * Un fallo **no** se propaga: devuelve «sin ver». Es la opción menos mala de las
 * dos —enseñar el tour de más molesta un momento; tragarse el error y no
 * enseñarlo nunca deja al usuario nuevo sin ayuda y sin saber que existía—, y
 * de todas formas la primera vez tampoco hay fila que leer.
 */
export async function getEstadoOnboarding(): Promise<EstadoOnboarding> {
  const { data, error } = await supabase
    .from('onboarding_usuario')
    .select('completado, version')
    .maybeSingle()

  if (error || !data) return SIN_VER
  return { completado: data.completado, version: data.version }
}

/**
 * Marca el tour como visto en la versión actual.
 *
 * Se llama tanto al terminarlo como al cerrarlo a medias, y eso es
 * deliberado: quien lo cierra está diciendo que no lo quiere: volver a
 * saltárselo en cada recarga sería insistir. Siempre queda «Ver el tutorial
 * otra vez» en su panel de cuenta.
 *
 * `upsert` porque la fila no existe hasta esta primera vez.
 *
 * **No lanza.** Que no se pueda guardar el estado no puede impedir cerrar el
 * tutorial: lo peor que pasa es que vuelva a salir en la próxima sesión.
 */
export async function marcarOnboardingVisto(usuarioId: string): Promise<void> {
  const { error } = await supabase.from('onboarding_usuario').upsert(
    {
      usuario_id: usuarioId,
      completado: true,
      version: VERSION_ONBOARDING,
      actualizado_at: new Date().toISOString(),
    },
    { onConflict: 'usuario_id' },
  )

  if (error) console.error('No se pudo guardar el estado del tutorial:', error)
}
