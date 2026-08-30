import { supabase } from '../lib/supabase'
import type { ClinicaConCatalogo } from './tienda'

/**
 * Los servicios de peluquería vistos desde el portal del dueño de mascota.
 *
 * Gemelo de [tienda.ts](./tienda.ts) y por el mismo motivo: aquí no hay
 * ninguna relación de propiedad con el negocio que se está mirando. El dueño ve
 * **cualquier** peluquería activa de la plataforma, no solo la suya —a
 * propósito distinto de `portalCliente.ts`, que gira entero alrededor de
 * `clientes.usuario_id`—.
 *
 * Las dos consultas son RPC y no `select`, y no es por comodidad:
 * `servicios_select` (0004) exige `auth_es_personal()`, así que una cuenta
 * `cliente` **no puede leer `servicios` ni de su propia clínica**. Las
 * funciones de la migración 0035 son `security definer` y exponen solo las
 * columnas públicas — nunca la comisión del peluquero ni las reglas de precio.
 *
 * ⚠️ **Esto no agenda.** El PRD §2 deja el agendamiento automático fuera del
 * MVP: la pantalla enseña el servicio y el dueño lo **solicita** por WhatsApp
 * con `enlaceWhatsapp()`, que es un `wa.me` puro y no gasta cuota del plan.
 * Quien agenda sigue siendo una persona de la peluquería.
 */

/** Misma forma que la de la Tienda: las dos funciones devuelven lo mismo. */
export type PeluqueriaDisponible = ClinicaConCatalogo

export interface ServicioPeluqueriaPublico {
  id: string
  nombre: string
  precio_bs: number
  duracion_minutos: number
  categoria_grooming: string
  especie_permitida: string
  tamano_permitido: string
}

export async function listPeluquerias(): Promise<PeluqueriaDisponible[]> {
  const { data, error } = await supabase.rpc('clinicas_con_peluqueria')
  if (error) throw new Error(`No se pudieron cargar las peluquerías: ${error.message}`)
  return (data ?? []) as PeluqueriaDisponible[]
}

export async function listServiciosDePeluqueria(
  clinicaId: string,
): Promise<ServicioPeluqueriaPublico[]> {
  const { data, error } = await supabase.rpc('servicios_peluqueria_de', {
    p_clinica_id: clinicaId,
  })
  if (error) throw new Error(`No se pudieron cargar los servicios: ${error.message}`)
  return (data ?? []) as ServicioPeluqueriaPublico[]
}

/** Los rótulos de `peluqueria_servicios_config`, para no enseñar la clave cruda. */
export const CATEGORIA_GROOMING_LABEL: Record<string, string> = {
  bano: 'Baño',
  corte: 'Corte',
  higiene: 'Higiene',
  tratamiento: 'Tratamiento',
  personalizado: 'Personalizado',
}

export const ESPECIE_PERMITIDA_LABEL: Record<string, string> = {
  todos: '',
  canino: 'Solo perros',
  felino: 'Solo gatos',
}

export const TAMANO_PERMITIDO_LABEL: Record<string, string> = {
  todos: '',
  pequeno: 'Talla pequeña',
  mediano: 'Talla mediana',
  grande: 'Talla grande',
  gigante: 'Talla gigante',
}
