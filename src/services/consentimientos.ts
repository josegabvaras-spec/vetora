import { supabase } from '../lib/supabase'
import type { ConsentimientoCirugia, MetodoAceptacionConsentimiento } from '../types/database'

/**
 * Trazos y nombres que se congelan en el documento.
 *
 * Los nombres se guardan, no se resuelven por join: un consentimiento es un
 * documento legal y tiene que seguir diciendo quién firmó aunque después el
 * cliente cambie de nombre en su ficha o el veterinario cause baja.
 */
export interface FirmasConsentimiento {
  firmaTutor: string
  firmaVeterinario: string
  nombreTutor: string
  nombreVeterinario: string
  veterinarioId: string
}

/**
 * Genera (INSERT-only) el consentimiento de cirugía para una cita.
 * PRD §5.2: "El historial clínico cerrado y los consentimientos firmados NO
 * se pueden editar" - por eso este servicio nunca expone un update/delete.
 *
 * Las firmas viajan en el MISMO insert, no en un update posterior: la tabla no
 * tiene policy de UPDATE justamente para que el documento sea inmutable, así
 * que firmar después sería imposible. Se firma y se guarda, o no se guarda.
 */
export async function generarConsentimiento(
  citaId: string,
  pacienteId: string,
  metodoAceptacion: MetodoAceptacionConsentimiento,
  firmas?: FirmasConsentimiento,
): Promise<ConsentimientoCirugia> {
  // Un consentimiento digital sin trazo es una casilla marcada, no una firma.
  if (metodoAceptacion === 'firma_digital' && (!firmas?.firmaTutor || !firmas?.firmaVeterinario)) {
    throw new Error('Faltan las firmas del tutor y del veterinario')
  }

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
      firma_tutor: firmas?.firmaTutor ?? null,
      firma_veterinario: firmas?.firmaVeterinario ?? null,
      nombre_tutor: firmas?.nombreTutor ?? null,
      nombre_veterinario: firmas?.nombreVeterinario ?? null,
      veterinario_id: firmas?.veterinarioId ?? null,
    })
    .select()
    .single()

  if (error || !consentimiento) throw new Error(`Error al generar consentimiento: ${error?.message || 'desconocido'}`)

  return consentimiento as ConsentimientoCirugia
}

/**
 * Consentimientos firmados de un paciente, del más reciente al más antiguo.
 *
 * Los usan la ficha del paciente y el portal del dueño. Cada uno ve lo suyo por
 * RLS: `consentimientos_select` (personal) y `consentimientos_portal` (el tutor,
 * solo sobre sus propias mascotas) — la consulta es la misma.
 */
export async function listConsentimientosDePaciente(pacienteId: string): Promise<ConsentimientoCirugia[]> {
  const { data, error } = await supabase
    .from('consentimientos_cirugia')
    .select('*')
    .eq('paciente_id', pacienteId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`No se pudieron cargar los consentimientos: ${error.message}`)
  return (data ?? []) as ConsentimientoCirugia[]
}
