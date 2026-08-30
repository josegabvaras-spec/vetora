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

  // `,` y `)` cierran el filtro `or` de PostgREST; escapar es lo que impide que
  // un nombre con una coma se convierta en otra condición.
  const patron = `%${termino.replace(/[,)(]/g, ' ')}%`

  const { data, error } = await supabase
    .from('catalogo_productos')
    .select('*')
    .eq('disponible', true)
    .or(`nombre.ilike.${patron},descripcion.ilike.${patron},categoria.ilike.${patron}`)
    .order('nombre')
    .limit(60)

  if (error) throw new Error(`No se pudo buscar en las tiendas: ${error.message}`)
  return (data ?? []) as CatalogoProducto[]
}

export { urlFotoCatalogo } from './catalogo'
