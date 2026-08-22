// Tipos compuestos usados por la UI (resultado de "joins" entre tablas).
// En Supabase real corresponden a `select` con relaciones anidadas.

import type {
  Cita,
  Clinica,
  Cliente,
  Cobro,
  ConsentimientoCirugia,
  DesparasitacionAplicada,
  Especie,
  HistorialClinico,
  Internacion,
  MetodoPago,
  MovimientoInventario,
  NotaInternacion,
  Paciente,
  Plan,
  Producto,
  RecetaItem,
  TipoCita,
  Usuario,
  VacunaAplicada,
} from './database'

/** Consumo frente al tope del plan. El panel y las validaciones leen lo mismo. */
export interface UsoLimite {
  usados: number
  maximo: number
}

export interface LimitesClinica {
  plan: Plan
  sucursales: UsoLimite
  usuarios: UsoLimite
  whatsapp: UsoLimite
}

/** Fila del panel de plataforma: la clínica con su plan, consumo y actividad. */
export interface ClinicaConDetalle extends Clinica {
  plan_nombre: string
  precio_lista_usd: number
  limites: LimitesClinica
  total_pacientes: number
  total_citas: number
  usuarios: Usuario[]
}

export interface ResumenPlataforma {
  clinicas_activas: number
  clinicas_suspendidas: number
  /**
   * Ingreso mensual recurrente **en dólares**: suma de lo acordado con las
   * clínicas activas. Toda la suscripción va en dólares desde 0019.
   */
  ingreso_mensual_usd: number
  en_mora: number
  importe_en_mora_usd: number
  whatsapp_enviados: number
  whatsapp_limite: number
  
  // Nuevas métricas
  mrr_crecimiento_pct: number
  usuarios_totales: number
  pacientes_totales: number
  citas_totales: number
  
  // La salud del sistema ya no viaja aquí: era un puñado de literales
  // («operativo», 99.98 %, cero errores) que no medían nada. Ahora se pide
  // aparte y se mide de verdad — ver services/salud.ts (0018).

  // Gráficos
  historial_mrr: { mes: string; mrr: number }[]
}

/** Estadía en curso de un paciente, para señalarla allá donde aparezca. */
export interface InternacionResumen {
  id: string
  fecha_ingreso: string
  dias: number
  motivo: string
  jaula?: string | null
}

export interface PacienteConDueno extends Paciente {
  cliente: Cliente
  /** Internación abierta, si el paciente está hospitalizado ahora mismo. */
  internacion_activa?: InternacionResumen | null
  /** Citas programadas para hoy. */
  citas_hoy?: CitaConDetalle[]
}

/** Consulta de la que una reconsulta es seguimiento. */
export interface ConsultaOrigen {
  cita_id: string
  fecha_hora: string
  motivo: string
}

/**
 * Consulta abierta y sin cerrar: el borrador de historial que espera a que un
 * veterinario lo atienda.
 *
 * Lo abre recepción desde la cita —o el propio veterinario— y queda vivo hasta
 * que se cierra. Lleva solo lo justo para pintar la fila del asistente y
 * navegar a la ficha; el resto ya está en el expediente.
 */
export interface ConsultaAbierta {
  historial_id: string
  paciente_id: string
  paciente_nombre: string
  cliente_nombre: string
  /**
   * A quién le toca atenderla. El veterinario no lo necesita —todo lo que ve es
   * suyo—, pero el administrador ve la clínica entera y sin esto no sabría de
   * quién es cada consulta.
   */
  veterinario_nombre: string
  motivo: string
  /** De la cita a la que cuelga: cuándo estaba citado y de qué tipo. */
  cita_id: string
  fecha_hora: string
  tipo_cita: TipoCita
  /** El día clínico de la cita ya pasó: se abrió y quedó sin cerrar. */
  atrasada: boolean
}

export interface CitaConDetalle extends Cita {
  paciente: PacienteConDueno
  veterinario_nombre: string
  consentimiento?: ConsentimientoCirugia | null
  /** Historial clínico ya registrado para esta cita, si existe. */
  historial_id?: string | null
  /** Procedimiento concreto del catálogo (qué cirugía se realiza). */
  servicio_nombre?: string | null
  /** Solo en reconsultas: la consulta que se está controlando. */
  origen?: ConsultaOrigen | null
  /** Internación abierta generada desde esta cita, si la hay. */
  internacion_id?: string | null
}

/** Producto consumido en una consulta, con el precio para el recibo. */
export interface ProductoUsado {
  movimiento_id: string
  producto_id: string
  nombre: string
  cantidad: number
  /**
   * Unidad en que está expresada `cantidad` (ml, g, unidad…). Sin ella un "5"
   * no dice si se usaron 5 mililitros o 5 frascos, que en un frasco de 50 ml es
   * la diferencia entre una dosis y todo el envase.
   */
  unidad_medida: string
  precio_bs: number
}

export interface HistorialConDetalle extends HistorialClinico {
  veterinario_nombre: string
  vacunas: VacunaAplicada[]
  desparasitaciones: DesparasitacionAplicada[]
  productosUsados: ProductoUsado[]
  receta: RecetaItem[]
  /** Tipo de la cita que originó la consulta (consulta, reconsulta, cirugía…). */
  tipo_cita: TipoCita
  /** Procedimiento concreto, cuando la cita apuntaba a uno del catálogo. */
  procedimiento?: string | null
  /** Consulta previa que esta reconsulta controla. */
  origen?: ConsultaOrigen | null
}

export interface FichaPaciente {
  paciente: PacienteConDueno
  historiales: HistorialConDetalle[]
  /** Estadías del paciente, de la más reciente a la más antigua. */
  internaciones: InternacionConDetalle[]
  /** Historial completo de citas del paciente. */
  citas: CitaConDetalle[]
  /** Todas las vacunas aplicadas al paciente. */
  vacunas: VacunaAplicada[]
  /**
   * Todas las desparasitaciones del paciente. Antes solo viajaban anidadas por
   * historial, y el esquema sanitario las necesita al mismo nivel que las
   * vacunas: desde 0014 una dosis puede no tener consulta detrás.
   */
  desparasitaciones: DesparasitacionAplicada[]
}

export interface ProductoConMovimientos extends Producto {
  movimientos: MovimientoInventario[]
}

/** Desglose de lo que se cobra por una atención. */
export interface LineaCobro {
  concepto: string
  cantidad: number
  precio_unitario_bs: number
  subtotal_bs: number
  servicio_id?: string | null
  producto_id?: string | null
  /**
   * Movimiento de inventario que generó esta línea. **Solo de interfaz**:
   * `cobro_lineas` no tiene esta columna y no se persiste.
   *
   * Es la clave con la que caja identifica qué línea está ajustando de precio.
   * `producto_id` no serviría —un mismo producto puede consumirse en dos
   * movimientos de la misma atención— y el índice del array tampoco, porque el
   * servidor reconstruye las líneas por su cuenta al registrar el cobro.
   */
  movimiento_id?: string | null
}

/** Lo que se cobra: una cita atendida o una internación dada de alta. */
export type TipoAtencion = 'cita' | 'internacion'

export interface AtencionPorCobrar {
  tipo: TipoAtencion
  /** Id de la cita o de la internación, según `tipo`. */
  referencia_id: string
  paciente_nombre: string
  cliente_nombre: string
  veterinario_nombre: string
  /** Descripción de la atención: "Cirugía · Ovariohisterectomía", "Internación · 3 días". */
  concepto: string
  fecha: string
  /**
   * Lo ya devengado: productos consumidos y, en una internación, los días de
   * estadía. Los servicios se eligen al cobrar.
   *
   * «Fijas» se refiere a que la atención ya las causó —no se añaden ni se
   * quitan en caja—, no a su importe: las de producto llevan `movimiento_id` y
   * quien cobra puede fijarles el precio que se le cobra al cliente. La estadía
   * no lo lleva y conserva su `precio_dia_bs` congelado.
   */
  lineasFijas: LineaCobro[]
  subtotal_fijo_bs: number
  /** Servicio del catálogo que caja debería traer preseleccionado. */
  servicio_sugerido_id?: string | null
}

export interface CobroConDetalle extends Cobro {
  paciente_nombre: string
  cliente_nombre: string
  veterinario_nombre: string
  /** Atención cobrada, ya legible ("Reconsulta", "Internación · 3 días"). */
  concepto_atencion: string
  fecha_atencion: string
  lineas: LineaCobro[]
}

export interface NotaInternacionConDetalle extends NotaInternacion {
  veterinario_nombre: string
}

export interface InternacionConDetalle extends Internacion {
  paciente: PacienteConDueno
  veterinario_nombre: string
  servicio_nombre: string
  notas: NotaInternacionConDetalle[]
  productosUsados: ProductoUsado[]
  /** Días de estadía computados: cada día iniciado cuenta, mínimo 1. */
  dias: number
  costo_estadia_bs: number
  costo_productos_bs: number
  cobrada: boolean
}

/**
 * Aviso que toca dar (PRD Épica 4). No es una tabla: se deriva de las citas,
 * las vacunas y las desparasitaciones ya registradas, así que nunca se
 * desincroniza de ellas.
 */
export type TipoAviso =
  | 'recordatorio_cita'
  | 'preparacion_cirugia'
  | 'refuerzo_vacuna'
  | 'proxima_desparasitacion'
  | 'seguimiento_post_consulta'
  | 'cumpleanos_paciente'
  | 'atencion_sin_cobrar'
  | 'examen_listo'
  | 'paciente_inactivo'

export interface Programado {
  /** Estable entre recargas: tipo + fila de origen. */
  id: string
  tipo: TipoAviso
  /** Cita, vacuna o desparasitación de la que sale el aviso. */
  referencia_id: string
  paciente_id: string
  paciente_nombre: string
  especie: Especie
  cliente_nombre: string
  whatsapp: string
  /** Cuándo es la cita, o cuándo tocaba el refuerzo. */
  fecha: string
  /** La fecha ya pasó (refuerzo vencido). */
  vencido: boolean
  /** Qué vacuna, qué antiparasitario, qué cirugía. */
  detalle: string
  /** Solo las citas guardan si ya se avisó; ver services/programados.ts. */
  ya_avisado: boolean
}

/** Lo que el administrador ve resumido del día. */
export interface ResumenDelDia {
  fecha: string
  citas_hoy: number
  sin_confirmar: number
  cirugias_sin_consentimiento: number
  refuerzos_vencidos: number
  productos_bajo_minimo: string[]
  ingresos_hoy_bs: number
}

export type OrigenMovimiento = 'caja' | 'inventario'

/** Fila de la bitácora unificada que ve el administrador. */
export interface MovimientoUnificado {
  id: string
  origen: OrigenMovimiento
  fecha: string
  sucursal_id: string | null
  descripcion: string
  detalle: string
  /** Solo los movimientos de caja tienen importe. */
  monto_bs: number | null
  metodo_pago?: MetodoPago | null
}
