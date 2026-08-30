import type { CategoriaRetail } from '../types/database'

/**
 * Los rótulos de las categorías de retail (`productos.categoria_retail`,
 * migración 0030).
 *
 * Está en `lib/` y no en `services/petshop.ts` —de donde salió— porque es un
 * dato puro que no toca Supabase, y porque desde 0033 lo necesitan **dos**
 * servicios: el del petshop, para pintar sus listas, y `catalogo.ts`, para
 * poner la categoría en español al publicar un producto en la Tienda. Con el
 * mapa dentro de `services/petshop.ts` esos dos se importaban en círculo.
 */
export const CATEGORIA_RETAIL_LABEL: Record<CategoriaRetail, string> = {
  alimento: 'Alimento y Nutrición',
  medicamento: 'Farmacia / Medicamento',
  antiparasitario: 'Antiparasitarios',
  suplemento: 'Vitaminas y Suplementos',
  higiene: 'Higiene y Cosmética',
  accesorio: 'Collares, Correas y Accesorios',
  juguete: 'Juguetes',
  ropa: 'Ropa y Camas',
  otro: 'Otros Artículos',
}

/**
 * La misma lista, en el orden en que se ofrece en los desplegables.
 *
 * **Derivada del mapa de arriba, no escrita a mano**: eran dos listas
 * paralelas y ya habían divergido — `accesorio` era «Collares, Correas y
 * Accesorios» en una y «Collares y Accesorios» en la otra, así que el mismo
 * producto se llamaba distinto según la pantalla.
 */
export const CATEGORIAS_RETAIL: { id: CategoriaRetail; label: string }[] = (
  Object.keys(CATEGORIA_RETAIL_LABEL) as CategoriaRetail[]
).map((id) => ({ id, label: CATEGORIA_RETAIL_LABEL[id] }))
