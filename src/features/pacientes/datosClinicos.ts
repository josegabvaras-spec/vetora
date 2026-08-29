import { aNumeroOpcional } from '../../lib/numeros'
import type { HistorialClinico } from '../../types/database'

/**
 * La forma de la ficha clinica de una consulta, y las conversiones entre esa
 * forma y la fila de historial_clinico.
 *
 * Viven aqui y no en FormularioClinico.tsx porque ese fichero exporta un
 * componente, y un modulo que exporta componentes y no componentes a la vez
 * rompe el Fast Refresh de Vite: al tocar cualquiera de las dos cosas se
 * recarga entero y se pierde lo que hubiera escrito en la consulta.
 */
/**
 * Estado del formulario clínico. Todo se mantiene como string (lo que
 * devuelven los inputs) y se convierte al guardar con `aCamposHistorial`,
 * para que los campos vacíos lleguen como null y no como 0 o ''.
 */
export interface DatosClinicos {
  // Anamnesis
  motivo: string
  sintomas: string
  tiempo_evolucion: string
  apetito: string
  consumo_agua: string
  vomitos: string
  heces_consistencia: string
  heces_color: string
  orina: string
  desparasitacion_al_dia: string // '' | 'si' | 'no'
  // Examen físico
  peso_kg: string
  temperatura_c: string
  frecuencia_cardiaca: string
  frecuencia_respiratoria: string
  deshidratacion: string
  mucosas: string
  tllc: string
  condicion_corporal: string
  estado_conciencia: string
  observaciones_examen: string
  // Conclusión
  diagnostico: string
  tratamiento: string
}

export function datosClinicosVacios(): DatosClinicos {
  return {
    motivo: '',
    sintomas: '',
    tiempo_evolucion: '',
    apetito: '',
    consumo_agua: '',
    vomitos: '',
    heces_consistencia: '',
    heces_color: '',
    orina: '',
    desparasitacion_al_dia: '',
    peso_kg: '',
    temperatura_c: '',
    frecuencia_cardiaca: '',
    frecuencia_respiratoria: '',
    deshidratacion: '',
    mucosas: '',
    tllc: '',
    condicion_corporal: '',
    estado_conciencia: '',
    observaciones_examen: '',
    diagnostico: '',
    tratamiento: '',
  }
}

const texto = (v: string | null | undefined) => v ?? ''
const numero = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v))

/** Rellena el formulario a partir de un historial ya guardado. */
export function datosClinicosDesde(h: HistorialClinico): DatosClinicos {
  return {
    motivo: h.motivo,
    sintomas: texto(h.sintomas),
    tiempo_evolucion: texto(h.tiempo_evolucion),
    apetito: texto(h.apetito),
    consumo_agua: texto(h.consumo_agua),
    vomitos: texto(h.vomitos),
    heces_consistencia: texto(h.heces_consistencia),
    heces_color: texto(h.heces_color),
    orina: texto(h.orina),
    desparasitacion_al_dia:
      h.desparasitacion_al_dia === null || h.desparasitacion_al_dia === undefined
        ? ''
        : h.desparasitacion_al_dia
          ? 'si'
          : 'no',
    peso_kg: numero(h.peso_kg),
    temperatura_c: numero(h.temperatura_c),
    frecuencia_cardiaca: numero(h.frecuencia_cardiaca),
    frecuencia_respiratoria: numero(h.frecuencia_respiratoria),
    deshidratacion: texto(h.deshidratacion),
    mucosas: texto(h.mucosas),
    tllc: texto(h.tllc),
    condicion_corporal: numero(h.condicion_corporal),
    estado_conciencia: texto(h.estado_conciencia),
    observaciones_examen: texto(h.observaciones_examen),
    diagnostico: h.diagnostico,
    tratamiento: h.tratamiento,
  }
}

const nuloSiVacio = (v: string) => (v.trim() ? v.trim() : null)

/** Convierte el estado del formulario a los campos que espera el historial. */
export function aCamposHistorial(d: DatosClinicos): Partial<HistorialClinico> & { motivo: string } {
  return {
    motivo: d.motivo.trim(),
    sintomas: d.sintomas,
    tiempo_evolucion: nuloSiVacio(d.tiempo_evolucion),
    apetito: nuloSiVacio(d.apetito),
    consumo_agua: nuloSiVacio(d.consumo_agua),
    vomitos: nuloSiVacio(d.vomitos),
    heces_consistencia: nuloSiVacio(d.heces_consistencia),
    heces_color: nuloSiVacio(d.heces_color),
    orina: nuloSiVacio(d.orina),
    desparasitacion_al_dia: d.desparasitacion_al_dia === '' ? null : d.desparasitacion_al_dia === 'si',
    peso_kg: aNumeroOpcional(d.peso_kg),
    temperatura_c: aNumeroOpcional(d.temperatura_c),
    frecuencia_cardiaca: aNumeroOpcional(d.frecuencia_cardiaca),
    frecuencia_respiratoria: aNumeroOpcional(d.frecuencia_respiratoria),
    deshidratacion: nuloSiVacio(d.deshidratacion),
    mucosas: nuloSiVacio(d.mucosas),
    tllc: nuloSiVacio(d.tllc),
    condicion_corporal: aNumeroOpcional(d.condicion_corporal),
    estado_conciencia: nuloSiVacio(d.estado_conciencia),
    observaciones_examen: nuloSiVacio(d.observaciones_examen),
    diagnostico: d.diagnostico,
    tratamiento: d.tratamiento,
  } as Partial<HistorialClinico> & { motivo: string }
}
