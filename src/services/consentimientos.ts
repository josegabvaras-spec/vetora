import { supabase } from '../lib/supabase'
import type { ConsentimientoCirugia, MetodoAceptacionConsentimiento } from '../types/database'

/**
 * Genera (INSERT-only) el consentimiento de cirugía para una cita.
 * PRD §5.2: "El historial clínico cerrado y los consentimientos firmados NO
 * se pueden editar" - por eso este servicio nunca expone un update/delete.
 */
export async function generarConsentimiento(
  citaId: string,
  pacienteId: string,
  metodoAceptacion: MetodoAceptacionConsentimiento,
): Promise<ConsentimientoCirugia> {
  const { data: existente } = await supabase.from('consentimientos_cirugia').select('id').eq('cita_id', citaId).maybeSingle()
  
  if (existente) {
    throw new Error('Ya existe un consentimiento generado para esta cita')
  }

  const { data: consentimiento, error } = await supabase
    .from('consentimientos_cirugia')
    .insert({
      cita_id: citaId,
      paciente_id: pacienteId,
      // En producción: PDF real generado y subido a Supabase Storage.
      url_pdf: `#consentimiento-${citaId}.pdf`,
      metodo_aceptacion: metodoAceptacion,
    } as any)
    .select()
    .single()

  if (error || !consentimiento) throw new Error(`Error al generar consentimiento: ${error?.message || 'desconocido'}`)
  
  return consentimiento as ConsentimientoCirugia
}
