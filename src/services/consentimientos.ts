import { db, newId } from '../mocks/db'
import type { ConsentimientoCirugia, MetodoAceptacionConsentimiento } from '../types/database'

function delay<T>(value: T): Promise<T> {
  return Promise.resolve(value)
}

/**
 * Genera (INSERT-only) el consentimiento de cirugía para una cita.
 * PRD §5.2: "El historial clínico cerrado y los consentimientos firmados NO
 * se pueden editar" — por eso este servicio nunca expone un update/delete.
 */
export async function generarConsentimiento(
  citaId: string,
  pacienteId: string,
  metodoAceptacion: MetodoAceptacionConsentimiento,
): Promise<ConsentimientoCirugia> {
  const existente = db.get('consentimientos_cirugia').find((c) => c.cita_id === citaId)
  if (existente) {
    throw new Error('Ya existe un consentimiento generado para esta cita')
  }

  const consentimiento: ConsentimientoCirugia = {
    id: newId('consentimiento'),
    clinica_id: db.clinicaActivaId(),
    cita_id: citaId,
    paciente_id: pacienteId,
    // En producción: PDF real generado y subido a Supabase Storage.
    url_pdf: `#consentimiento-${citaId}.pdf`,
    metodo_aceptacion: metodoAceptacion,
    created_at: new Date().toISOString(),
  }
  db.set('consentimientos_cirugia', [...db.get('consentimientos_cirugia'), consentimiento])
  return delay(consentimiento)
}
