import { supabase } from '../lib/supabase'

/**
 * Firma de los informes que se imprimen desde la ficha del paciente.
 *
 * Estos documentos no tienen fila propia —se componen al vuelo desde el
 * historial—, así que la firma se ancla a `(paciente, tipo, item)` en
 * `informes_firmados` (migración 0015).
 *
 * La tabla es INSERT-only. Volver a firmar añade una fila y la página enseña la
 * más reciente: el historial completo cambia con el tiempo, y una firma de
 * marzo no certifica lo que el documento dice en junio.
 */

export type TipoInforme = 'historial' | 'consulta' | 'laboratorio' | 'imagenologia' | 'cirugia'

export interface InformeFirmado {
  id: string
  paciente_id: string
  tipo: TipoInforme
  item_id: string | null
  firma_tutor: string
  firma_veterinario: string
  nombre_tutor: string
  nombre_veterinario: string
  created_at: string
}

export interface FirmasInforme {
  firmaTutor: string
  firmaVeterinario: string
  nombreTutor: string
  nombreVeterinario: string
  veterinarioId?: string | null
}

/** La firma vigente de ese documento, o null si todavía no se firmó. */
export async function getFirmaInforme(
  pacienteId: string,
  tipo: TipoInforme,
  itemId?: string | null,
): Promise<InformeFirmado | null> {
  let query = supabase
    .from('informes_firmados')
    .select('*')
    .eq('paciente_id', pacienteId)
    .eq('tipo', tipo)
    .order('created_at', { ascending: false })
    .limit(1)

  // `is('item_id', null)` y `eq` no son intercambiables: en SQL `null = null`
  // es null, así que el historial completo (sin item) necesita `is`.
  query = itemId ? query.eq('item_id', itemId) : query.is('item_id', null)

  const { data, error } = await query
  if (error) throw new Error(`No se pudo leer la firma del informe: ${error.message}`)
  return (data?.[0] as InformeFirmado) ?? null
}

export async function firmarInforme(
  pacienteId: string,
  tipo: TipoInforme,
  itemId: string | null,
  firmas: FirmasInforme,
): Promise<InformeFirmado> {
  if (!firmas.firmaTutor || !firmas.firmaVeterinario) {
    throw new Error('Faltan las firmas del tutor y del veterinario')
  }

  const { data, error } = await supabase
    .from('informes_firmados')
    .insert({
      paciente_id: pacienteId,
      tipo,
      item_id: itemId,
      firma_tutor: firmas.firmaTutor,
      firma_veterinario: firmas.firmaVeterinario,
      nombre_tutor: firmas.nombreTutor,
      nombre_veterinario: firmas.nombreVeterinario,
      veterinario_id: firmas.veterinarioId ?? null,
    })
    .select()
    .single()

  if (error || !data) throw new Error(`No se pudo firmar el informe: ${error?.message ?? 'desconocido'}`)
  return data as InformeFirmado
}
