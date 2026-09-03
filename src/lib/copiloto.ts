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
 * Los accesos rápidos, según lo que esa persona puede ver.
 *
 * No es cosmética: ofrecer «¿cómo van mis ventas?» a quien no tiene el módulo
 * de caja es prometer una respuesta que la RLS va a dejar vacía, y el copiloto
 * tendría que contestar que no encontró nada. Es peor que no ofrecerlo.
 */
export function atajosDelCopiloto(
  rol: string | undefined,
  modulos: ModuloVetora[] | undefined,
): string[] {
  const tiene = (m: ModuloVetora) => !modulos || modulos.includes(m)
  const atajos: string[] = []

  if (tiene('agenda')) atajos.push('¿Qué citas tengo hoy?')
  if (tiene('historial_clinico')) atajos.push('¿Qué pacientes no vienen hace más de 6 meses?')
  else if (tiene('fichas')) atajos.push('¿Qué clientes no vienen hace más de 3 meses?')
  if (tiene('inventario')) atajos.push('¿Qué productos tengo que reponer?')
  // Lo que se cobró es del negocio, no del turno de quien atiende.
  if (tiene('caja') && (rol === 'admin' || rol === 'recepcion')) {
    atajos.push('¿Cuánto se cobró esta semana?')
  }

  return atajos
}
