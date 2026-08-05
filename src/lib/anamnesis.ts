// Catálogo de hallazgos clínicos con valores estandarizados.
// Única fuente de verdad: la usan el formulario de consulta, el alta de
// pacientes y el historial impreso, para que las etiquetas no se dupliquen.

export interface OpcionClinica {
  valor: string
  label: string
}

export const OPCIONES_APETITO = [
  { valor: 'normal', label: 'Normal' },
  { valor: 'disminuido', label: 'Disminuido (hiporexia)' },
  { valor: 'ausente', label: 'Ausente (anorexia)' },
  { valor: 'aumentado', label: 'Aumentado (polifagia)' },
] as const

export const OPCIONES_CONSUMO_AGUA = [
  { valor: 'normal', label: 'Normal' },
  { valor: 'disminuido', label: 'Disminuido' },
  { valor: 'aumentado', label: 'Aumentado (polidipsia)' },
] as const

export const OPCIONES_VOMITOS = [
  { valor: 'no', label: 'No presenta' },
  { valor: 'ocasional', label: 'Ocasional' },
  { valor: 'frecuente', label: 'Frecuente' },
] as const

export const OPCIONES_HECES_CONSISTENCIA = [
  { valor: 'normal', label: 'Normal / formada' },
  { valor: 'blanda', label: 'Blanda' },
  { valor: 'diarrea', label: 'Diarrea' },
  { valor: 'estrenimiento', label: 'Estreñimiento' },
] as const

export const OPCIONES_HECES_COLOR = [
  { valor: 'marron_normal', label: 'Marrón (normal)' },
  { valor: 'amarillenta', label: 'Amarillenta' },
  { valor: 'verdosa', label: 'Verdosa' },
  { valor: 'negra_melena', label: 'Negra (melena)' },
  { valor: 'con_sangre', label: 'Con sangre (hematoquecia)' },
  { valor: 'acolica', label: 'Pálida / acólica' },
] as const

export const OPCIONES_ORINA = [
  { valor: 'normal', label: 'Normal' },
  { valor: 'aumentada', label: 'Aumentada (poliuria)' },
  { valor: 'disminuida', label: 'Disminuida (oliguria)' },
  { valor: 'con_sangre', label: 'Con sangre (hematuria)' },
  { valor: 'dificultad', label: 'Con dificultad (disuria)' },
] as const

export const OPCIONES_DESHIDRATACION = [
  { valor: 'normal', label: 'Hidratado (normal)' },
  { valor: 'leve_5', label: 'Leve (~5%)' },
  { valor: 'moderada_8', label: 'Moderada (~8%)' },
  { valor: 'severa_10', label: 'Severa (>10%)' },
] as const

export const OPCIONES_MUCOSAS = [
  { valor: 'rosadas', label: 'Rosadas (normal)' },
  { valor: 'palidas', label: 'Pálidas' },
  { valor: 'ictericas', label: 'Ictéricas' },
  { valor: 'cianoticas', label: 'Cianóticas' },
  { valor: 'congestivas', label: 'Congestivas' },
] as const

export const OPCIONES_TLLC = [
  { valor: 'menor_2s', label: '< 2 seg (normal)' },
  { valor: 'mayor_2s', label: '> 2 seg (prolongado)' },
] as const

export const OPCIONES_ESTADO_CONCIENCIA = [
  { valor: 'alerta', label: 'Alerta' },
  { valor: 'deprimido', label: 'Deprimido / letárgico' },
  { valor: 'estuporoso', label: 'Estuporoso' },
  { valor: 'comatoso', label: 'Comatoso' },
] as const

export type Apetito = (typeof OPCIONES_APETITO)[number]['valor']
export type ConsumoAgua = (typeof OPCIONES_CONSUMO_AGUA)[number]['valor']
export type Vomitos = (typeof OPCIONES_VOMITOS)[number]['valor']
export type HecesConsistencia = (typeof OPCIONES_HECES_CONSISTENCIA)[number]['valor']
export type HecesColor = (typeof OPCIONES_HECES_COLOR)[number]['valor']
export type Orina = (typeof OPCIONES_ORINA)[number]['valor']
export type Deshidratacion = (typeof OPCIONES_DESHIDRATACION)[number]['valor']
export type Mucosas = (typeof OPCIONES_MUCOSAS)[number]['valor']
export type Tllc = (typeof OPCIONES_TLLC)[number]['valor']
export type EstadoConciencia = (typeof OPCIONES_ESTADO_CONCIENCIA)[number]['valor']

export const OPCIONES_CLINICAS = {
  apetito: OPCIONES_APETITO,
  consumo_agua: OPCIONES_CONSUMO_AGUA,
  vomitos: OPCIONES_VOMITOS,
  heces_consistencia: OPCIONES_HECES_CONSISTENCIA,
  heces_color: OPCIONES_HECES_COLOR,
  orina: OPCIONES_ORINA,
  deshidratacion: OPCIONES_DESHIDRATACION,
  mucosas: OPCIONES_MUCOSAS,
  tllc: OPCIONES_TLLC,
  estado_conciencia: OPCIONES_ESTADO_CONCIENCIA,
} as const

export type CampoClinico = keyof typeof OPCIONES_CLINICAS

/** Etiqueta legible de un valor clínico; null si no hay valor registrado. */
export function etiquetaClinica(campo: CampoClinico, valor: string | null | undefined): string | null {
  if (!valor) return null
  const opciones = OPCIONES_CLINICAS[campo] as readonly OpcionClinica[]
  return opciones.find((o) => o.valor === valor)?.label ?? valor
}

/** Escala de condición corporal de 1 a 9 usada en la práctica veterinaria. */
export const CONDICION_CORPORAL_OPCIONES: OpcionClinica[] = [
  { valor: '1', label: '1 — Caquéctico' },
  { valor: '2', label: '2 — Muy delgado' },
  { valor: '3', label: '3 — Delgado' },
  { valor: '4', label: '4 — Bajo lo ideal' },
  { valor: '5', label: '5 — Ideal' },
  { valor: '6', label: '6 — Sobre lo ideal' },
  { valor: '7', label: '7 — Sobrepeso' },
  { valor: '8', label: '8 — Obeso' },
  { valor: '9', label: '9 — Obesidad mórbida' },
]
