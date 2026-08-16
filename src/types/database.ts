// Modelo de datos basado en el PRD §6 (Esquema Relacional - Supabase / PostgreSQL)
// Toda tabla de negocio incluye clinica_id (para RLS multi-tenant) y created_at.

import type {
  Apetito,
  ConsumoAgua,
  Deshidratacion,
  EstadoConciencia,
  HecesColor,
  HecesConsistencia,
  Mucosas,
  Orina,
  Tllc,
  Vomitos,
} from '../lib/anamnesis'

/** `superadmin` es el dueño de la plataforma: no pertenece a ninguna clínica. */
export type Rol = 'superadmin' | 'admin' | 'veterinario' | 'recepcion' | 'cliente'

export type EstadoClinica = 'activa' | 'suspendida' | 'demo'

export type EstadoPago = 'al_dia' | 'en_mora'

export type TipoCita = 'consulta' | 'reconsulta' | 'vacuna' | 'cirugia' | 'desparasitacion' | 'peluqueria'

export type EstadoCita = 'pendiente' | 'confirmada' | 'completada' | 'cancelada'

export type TipoMovimientoInventario = 'ingreso' | 'egreso'

export type MetodoAceptacionConsentimiento = 'firma_digital' | 'firma_fisica_escaneada' | 'aceptacion_verbal_registrada'

export type Especie = 'canino' | 'felino' | 'ave' | 'exotico' | 'otro'

export type Sexo = 'macho' | 'hembra' | 'desconocido'

/** 1. Núcleo */

/**
 * Plan comercial. Deja de ser un tipo fijo del código: el dueño de la
 * plataforma lo crea y le pone precio y límites desde el panel, y de esos
 * límites depende lo que cada clínica puede hacer.
 */
export interface Plan {
  id: string
  nombre: string
  precio_mensual_bs: number
  whatsapp_limite: number
  max_sucursales: number
  max_usuarios: number
  /** Se desactivan en vez de borrarse: hay clínicas contratadas en ellos. */
  activo: boolean
  created_at: string
}

export interface Clinica {
  id: string
  nombre: string
  logo_url?: string | null
  plan_id: string
  /** Contacto de quien contrató el servicio. */
  responsable: string
  whatsapp: string
  ciudad: string
  whatsapp_mensajes_enviados: number
  estado: EstadoClinica

  /** Suscripción: lo pactado puede diferir del precio de lista del plan. */
  precio_acordado_bs: number
  fecha_alta: string
  proximo_cobro: string
  estado_pago: EstadoPago

  created_at: string
}

/** Catálogo de servicios facturables que gestiona el administrador. */
export type CategoriaServicio =
  | 'consulta'
  | 'cirugia'
  | 'laboratorio'
  | 'imagenologia'
  | 'internacion'
  | 'peluqueria'
  | 'otros'

export interface Servicio {
  id: string
  clinica_id: string
  nombre: string
  categoria: CategoriaServicio
  precio_bs: number
  /** Se desactivan en vez de borrarse: los cobros antiguos los siguen referenciando. */
  activo: boolean
  created_at: string
}

export interface Sucursal {
  id: string
  clinica_id: string
  nombre: string
  direccion: string
  created_at: string
}

export interface Usuario {
  id: string // Coincide con el id de Supabase Auth
  clinica_id: string | null // null => usuario de plataforma (superadmin)
  sucursal_id: string | null // null => acceso a todas las sucursales (admin)
  nombre: string
  /** Identificador de la cuenta. Único en todo el sistema, como en Supabase Auth. */
  email: string
  /** Obligatorio: es por donde se le manda su enlace de acceso. */
  whatsapp: string
  rol: Rol
  /** Se desactivan en vez de borrarse: firman historiales y cobros. */
  activo: boolean
  created_at: string
}

/**
 * Credenciales de acceso. **Solo existe en el modo de demostración**: en
 * producción esto es `auth.users` de Supabase Auth y la aplicación nunca ve una
 * contraseña. Por eso no aparece en la migración SQL.
 */
export interface Credencial {
  /** El mock fusiona las filas guardadas por `id`; todas las tablas lo llevan. */
  id: string
  usuario_id: string
  email: string
  hash: string
  salt: string
  actualizada_at: string
}

/**
 * Enlace de acceso que se envía por WhatsApp a un usuario recién creado. En
 * producción lo emite Supabase Auth (invite / magic link); aquí se modela con
 * un token de un solo uso y con caducidad, que es lo que hace que un enlace
 * enviado por mensajería no sea una llave permanente.
 */
export interface Invitacion {
  id: string
  clinica_id: string
  usuario_id: string
  token: string
  expira_at: string
  /** Momento en que se abrió WhatsApp con el mensaje listo para enviar. */
  enviado_at?: string | null
  /** Momento en que se usó para entrar; a partir de ahí el enlace muere. */
  usado_at?: string | null
  created_at: string
}

/** 2. Pacientes / Clientes */

export interface Cliente {
  id: string
  clinica_id: string
  usuario_id?: string | null
  nombre: string
  whatsapp: string
  ci: string
  created_at: string
}

export interface Paciente {
  id: string
  clinica_id: string
  cliente_id: string
  codigo: string
  nombre: string
  especie: Especie
  raza: string
  sexo: Sexo
  foto?: string | null
  fecha_nacimiento?: string | null
  /** Datos permanentes del paciente, no ligados a una consulta puntual. */
  alergias?: string | null
  antecedentes?: string | null
  created_at: string
}

/** 3. Clínico (inmutable tras cierre) */

export interface Cita {
  id: string
  clinica_id: string
  sucursal_id: string
  paciente_id: string
  veterinario_id: string
  fecha_hora: string // TIMESTAMPTZ ISO, siempre interpretado en America/La_Paz
  tipo_cita: TipoCita
  estado: EstadoCita
  /** Consulta previa de la que esta reconsulta es seguimiento (solo reconsultas). */
  cita_origen_id?: string | null
  /**
   * Procedimiento concreto del catálogo: qué cirugía, qué estudio. Permite que
   * "cirugía" deje de ser una etiqueta genérica y nombre la intervención.
   */
  servicio_id?: string | null
  notas?: string | null
  recordatorio_enviado: boolean // true una vez enviado el recordatorio de WhatsApp (24h antes)
  created_at: string
}

export interface HistorialClinico {
  id: string
  clinica_id: string
  paciente_id: string
  cita_id: string
  veterinario_id: string
  motivo: string
  sintomas?: string | null
  diagnostico: string
  tratamiento: string

  /** Anamnesis: lo que refiere el propietario/a. */
  tiempo_evolucion?: string | null
  apetito?: Apetito | null
  consumo_agua?: ConsumoAgua | null
  vomitos?: Vomitos | null
  heces_consistencia?: HecesConsistencia | null
  heces_color?: HecesColor | null
  orina?: Orina | null
  desparasitacion_al_dia?: boolean | null

  /** Examen físico: hallazgos objetivos del veterinario/a. */
  peso_kg?: number | null
  temperatura_c?: number | null
  frecuencia_cardiaca?: number | null
  frecuencia_respiratoria?: number | null
  deshidratacion?: Deshidratacion | null
  mucosas?: Mucosas | null
  tllc?: Tllc | null
  condicion_corporal?: number | null
  estado_conciencia?: EstadoConciencia | null
  observaciones_examen?: string | null

  editable: boolean // false una vez finalizado/cerrado -> bloqueado por RLS
  created_at: string
}

export interface VacunaAplicada {
  id: string
  clinica_id: string
  paciente_id: string
  historial_id: string
  nombre_vacuna: string
  fecha_aplicacion: string
  /** Fecha del próximo refuerzo; alimenta las alertas de vacunas (PRD Épica 4). */
  fecha_refuerzo?: string | null
  created_at: string
}

export type ViaDesparasitacion = 'oral' | 'topica' | 'inyectable'

/**
 * Dosis de antiparasitario aplicada. Va en tabla propia y no dentro de
 * `vacunas_aplicadas` porque el producto y la periodicidad son otros, y sus
 * avisos se cuentan por separado.
 */
export interface DesparasitacionAplicada {
  id: string
  clinica_id: string
  paciente_id: string
  historial_id: string
  producto: string
  via: ViaDesparasitacion
  fecha_aplicacion: string
  /** Fecha de la siguiente dosis; alimenta los avisos programados (PRD Épica 4). */
  fecha_proxima?: string | null
  created_at: string
}

export interface ExamenLaboratorio {
  id: string
  clinica_id: string
  paciente_id: string
  cita_id?: string | null
  tipo_examen: string
  estado: 'pendiente' | 'listo'
  fecha_solicitud: string
  fecha_resultado?: string | null
  resultados?: string | null
  informado_cliente: boolean
  created_at: string
}

export type ViaAdministracion = 'oral' | 'intramuscular' | 'subcutanea' | 'intravenosa' | 'topica' | 'oftalmica' | 'otica'

/**
 * Ítem de una receta médica emitida por el veterinario durante una consulta.
 * Solo se puede insertar mientras el historial es borrador (editable = true).
 * Al igual que las vacunas y desparasitaciones, es un registro clínico que
 * no se modifica: solo se agrega o elimina antes del cierre.
 */
export interface RecetaItem {
  id: string
  clinica_id: string
  historial_id: string
  paciente_id: string
  medicamento: string
  dosis: string
  via: ViaAdministracion
  frecuencia: string
  duracion: string
  /** Notas adicionales para el propietario/a (ej. "con comida", "no partir"). */
  indicaciones?: string | null
  created_at: string
}

export interface ConsentimientoCirugia {
  id: string
  clinica_id: string
  cita_id: string
  paciente_id: string
  url_pdf: string
  metodo_aceptacion: MetodoAceptacionConsentimiento
  created_at: string // Solo INSERT, nunca UPDATE/DELETE
}

/** 4. Inventario */

export interface Producto {
  id: string
  clinica_id: string
  sucursal_id: string
  sku: string
  nombre: string
  precio_bs: number
  stock_actual: number // CHECK (stock_actual >= 0)
  stock_minimo: number
  created_at: string
}

export interface MovimientoInventario {
  id: string
  clinica_id: string
  producto_id: string
  tipo: TipoMovimientoInventario
  cantidad: number
  motivo: string
  cita_id?: string | null
  /** Consumo durante una internación; se factura al dar de alta. */
  internacion_id?: string | null
  usuario_id?: string | null
  created_at: string
}

/** 5. Internación (hospitalización con estadía por días) */

export type EstadoInternacion = 'internado' | 'alta'

export interface Internacion {
  id: string
  clinica_id: string
  sucursal_id: string
  paciente_id: string
  veterinario_id: string
  /** Cita que originó el ingreso, cuando viene de la agenda. */
  cita_id?: string | null
  motivo: string
  /** Jaula o box asignado, para ubicar al paciente en la sala. */
  jaula?: string | null
  fecha_ingreso: string
  fecha_alta?: string | null
  /** Servicio del catálogo (categoría internación) que fija el precio por día. */
  servicio_dia_id: string
  /**
   * Precio por día congelado al ingreso: igual criterio que `cobro_lineas`,
   * cambiar el catálogo no debe alterar una estadía que ya está en curso.
   */
  precio_dia_bs: number
  indicaciones_alta?: string | null
  estado: EstadoInternacion
  created_at: string
}

/** Evolución diaria del paciente internado. Solo INSERT: es expediente clínico. */
export interface NotaInternacion {
  id: string
  clinica_id: string
  internacion_id: string
  veterinario_id: string
  nota: string
  temperatura_c?: number | null
  frecuencia_cardiaca?: number | null
  frecuencia_respiratoria?: number | null
  peso_kg?: number | null
  created_at: string
}

/** 6. Caja (PRD Épica 5: registro de transacciones tras la atención) */

export type MetodoPago = 'efectivo' | 'qr'

export type EstadoTurnoCaja = 'abierto' | 'cerrado'

export interface TurnoCaja {
  id: string
  clinica_id: string
  sucursal_id: string
  usuario_id: string
  saldo_inicial_bs: number
  abierto_at: string
  cerrado_at?: string | null
  /** Efectivo contado al cerrar; la diferencia se calcula contra lo esperado. */
  saldo_declarado_bs?: number | null
  diferencia_bs?: number | null
  estado: EstadoTurnoCaja
  created_at: string
}

/**
 * Inmutable: solo INSERT, igual que los consentimientos. Cobra exactamente una
 * atención: o una cita, o una internación dada de alta (nunca las dos).
 */
export interface Cobro {
  id: string
  clinica_id: string
  sucursal_id: string
  turno_id: string
  cita_id?: string | null
  internacion_id?: string | null
  cliente_nombre?: string | null
  usuario_id: string
  monto_bs: number
  metodo_pago: MetodoPago
  created_at: string
}

/**
 * Foto inmutable de lo cobrado. Se persiste en vez de recalcularse para que un
 * recibo ya emitido no cambie si después se edita el precio del catálogo.
 */
export interface CobroLinea {
  id: string
  clinica_id: string
  cobro_id: string
  concepto: string
  cantidad: number
  precio_unitario_bs: number
  subtotal_bs: number
  servicio_id?: string | null
  producto_id?: string | null
}
