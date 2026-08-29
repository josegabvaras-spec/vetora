import { etiquetaClinica } from '../lib/anamnesis'
import type { HistorialConDetalle } from '../types/views'

/** Par etiqueta/valor, la unidad con la que se pintan las tablas del papel. */
export type Fila = [etiqueta: string, valor: string | null | undefined]

/**
 * Las filas de anamnesis y examen fisico que comparten los documentos
 * impresos del expediente (historial completo, consulta e informe).
 *
 * Viven aqui y no en HistorialImprimirPage porque ese fichero exporta
 * componentes, y un modulo que exporta componentes y no componentes a la vez
 * rompe el Fast Refresh de Vite.
 */
export function anamnesisFilas(h: HistorialConDetalle): Fila[] {
  return [
    ['Motivo', h.motivo],
    ['Tiempo de evolución', h.tiempo_evolucion],
    ['Apetito', etiquetaClinica('apetito', h.apetito)],
    ['Consumo de agua', etiquetaClinica('consumo_agua', h.consumo_agua)],
    ['Vómitos', etiquetaClinica('vomitos', h.vomitos)],
    ['Orina', etiquetaClinica('orina', h.orina)],
    ['Heces: consistencia', etiquetaClinica('heces_consistencia', h.heces_consistencia)],
    ['Heces: color', etiquetaClinica('heces_color', h.heces_color)],
    [
      'Desparasitación al día',
      h.desparasitacion_al_dia === null || h.desparasitacion_al_dia === undefined
        ? null
        : h.desparasitacion_al_dia
          ? 'Sí'
          : 'No',
    ],
  ]
}

export function examenFilas(h: HistorialConDetalle): Fila[] {
  return [
    ['Peso (kg)', h.peso_kg?.toString()],
    ['Temperatura (°C)', h.temperatura_c?.toString()],
    ['Frec. cardíaca (lpm)', h.frecuencia_cardiaca?.toString()],
    ['Frec. respiratoria (rpm)', h.frecuencia_respiratoria?.toString()],
    ['Deshidratación', etiquetaClinica('deshidratacion', h.deshidratacion)],
    ['Mucosas', etiquetaClinica('mucosas', h.mucosas)],
    ['Llenado capilar (TLLC)', etiquetaClinica('tllc', h.tllc)],
    ['Estado de conciencia', etiquetaClinica('estado_conciencia', h.estado_conciencia)],
    ['Condición corporal', h.condicion_corporal ? `${h.condicion_corporal}/9` : null],
  ]
}
