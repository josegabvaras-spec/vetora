import { supabase } from '../lib/supabase'
import type { CatalogoProducto, TipoNegocio } from '../types/database'

/**
 * Tienda del portal del cliente: catálogos de CUALQUIER clínica activa con el
 * módulo `catalogo`, no solo la propia — a propósito distinto de
 * `portalCliente.ts`, que gira entero alrededor de `clientes.usuario_id`
 * ("mis mascotas en MI clínica"). Aquí no hay ninguna relación de propiedad
 * con la clínica que se está mirando.
 *
 * `clinicas_con_catalogo()` es una función `security definer` (migración
 * 0027): la RLS de `clinicas` (`id = auth_clinica_id() or auth_es_plataforma()`)
 * no deja leer la fila de una clínica ajena, ni siquiera para las columnas que
 * aquí sí son seguras de mostrar (nombre, logo, ciudad, tipo de negocio,
 * WhatsApp) — mismo patrón que `clinicas_para_registro()`.
 */

export interface ClinicaConCatalogo {
  id: string
  nombre: string
  logo_url: string | null
  ciudad: string
  tipo_negocio: TipoNegocio
  whatsapp: string
}

export async function listClinicasConCatalogo(): Promise<ClinicaConCatalogo[]> {
  const { data, error } = await supabase.rpc('clinicas_con_catalogo')
  if (error) throw new Error(`No se pudieron cargar las tiendas: ${error.message}`)
  return (data ?? []) as ClinicaConCatalogo[]
}

/** Solo lo disponible: la RLS de `catalogo_productos_portal` ya lo exige, esto es defensivo. */
export async function listProductosDeClinica(clinicaId: string): Promise<CatalogoProducto[]> {
  const { data, error } = await supabase
    .from('catalogo_productos')
    .select('*')
    .eq('clinica_id', clinicaId)
    .eq('disponible', true)
    .order('nombre')

  if (error) throw new Error(`No se pudieron cargar los productos: ${error.message}`)
  return (data ?? []) as CatalogoProducto[]
}

/**
 * Busca por nombre, descripción o categoría entre los productos de **todas**
 * las tiendas, para que el dueño pueda partir de lo que quiere comprar en vez
 * de tener que adivinar qué tienda lo tiene.
 *
 * No necesita RPC ni una policy nueva: `catalogo_productos_portal` autoriza
 * leer los productos disponibles de cualquier clínica con el módulo, sin
 * filtro por clínica — es la única tabla del proyecto pensada para eso. El
 * nombre y el WhatsApp de cada tienda los cruza quien llama con
 * `listClinicasConCatalogo()`, que ya se pide en esa pantalla.
 *
 * El tope de 60 es de la pantalla, no de la base: es una vitrina que se
 * recorre con la vista, no un informe.
 */
export async function buscarProductosEnTiendas(texto: string): Promise<CatalogoProducto[]> {
  const termino = texto.trim()
  if (!termino) return []

  // ⚠️ **TRES consultas y una unión en memoria, nunca un `.or()` con el
  // término dentro.** Antes era un `.or()` con el patrón interpolado, y se
  // intentaba salvar quitándole `,`, `(` y `)` — los separadores de la
  // sintaxis de filtros de PostgREST. Esa mitigación es exactamente la que el
  // hallazgo H-1 descarta: una lista negra de caracteres, encima superpuesta a
  // la gramática de LIKE, en la que basta olvidar un separador para que el
  // filtro deje de decir lo que aparenta. Y de paso no escapaba `%` ni `_`, así
  // que buscar "50%" listaba de más.
  //
  // Aquí importa más que en el POS: a esta función la llama un **cliente del
  // portal** —el rol menos confiable que existe en el sistema— y recorre los
  // catálogos de TODAS las clínicas, no los de la suya. Con tres consultas el
  // término viaja siempre como valor de un `ilike`, y `catalogo_productos_portal`
  // sigue siendo quien decide qué filas se ven.
  const patron = `%${termino.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

  const disponibles = () => supabase.from('catalogo_productos').select('*').eq('disponible', true)

  const [porNombre, porDescripcion, porCategoria] = await Promise.all([
    disponibles().ilike('nombre', patron).order('nombre').limit(60),
    disponibles().ilike('descripcion', patron).order('nombre').limit(60),
    disponibles().ilike('categoria', patron).order('nombre').limit(60),
  ])

  const error = porNombre.error ?? porDescripcion.error ?? porCategoria.error
  if (error) throw new Error(`No se pudo buscar en las tiendas: ${error.message}`)

  // Un producto puede casar por nombre y por descripción a la vez.
  const unicos = new Map<string, CatalogoProducto>()
  for (const p of [...(porNombre.data ?? []), ...(porDescripcion.data ?? []), ...(porCategoria.data ?? [])]) {
    unicos.set((p as CatalogoProducto).id, p as CatalogoProducto)
  }

  return [...unicos.values()]
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)))
    .slice(0, 60)
}

export { urlFotoCatalogo } from './catalogo'
