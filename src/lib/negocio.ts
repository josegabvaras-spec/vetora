import type { TipoNegocio } from '../types/database'

/**
 * Cómo se llama cada tipo de negocio en la interfaz (migración 0023).
 *
 * Una sola definición: lo pintan el alta de clínica
 * ([PlataformaClinicasPage](../pages/plataforma/PlataformaClinicasPage.tsx)) y
 * la edición ([ClinicaDetalleModal](../features/plataforma/ClinicaDetalleModal.tsx)).
 * Con las opciones escritas a mano en cada uno, el día que se añada un tipo
 * nuevo aparecería en un formulario y no en el otro.
 *
 * Es un `Record` sobre la unión de tipos, así que añadir un valor a
 * `TipoNegocio` sin darle etiqueta **rompe el build** — que es justo lo que se
 * quiere: obliga a decidir cómo se llama antes de poder usarlo.
 */
export const TIPO_NEGOCIO_LABEL: Record<TipoNegocio, string> = {
  veterinaria: '🏥 Clínica Veterinaria',
  peluqueria_canina: '✂️ Peluquería Canina',
  petshop: '🛍️ PetShop',
  mixto_vet_peluqueria: '🏥✂️ Veterinaria + Peluquería',
  mixto_petshop_peluqueria: '🛍️✂️ PetShop + Peluquería',
}

/** En el orden en que se ofrecen en los desplegables. */
export const TIPOS_NEGOCIO: TipoNegocio[] = [
  'veterinaria',
  'peluqueria_canina',
  'petshop',
  'mixto_vet_peluqueria',
  'mixto_petshop_peluqueria',
]
