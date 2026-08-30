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
export type Rol = 'superadmin' | 'admin' | 'veterinario' | 'recepcion' | 'cliente' | 'peluquero'

export type EstadoClinica = 'activa' | 'suspendida' | 'demo'

export type EstadoPago = 'al_dia' | 'en_mora'

/** Estado de un comprobante enviado por la clínica (migración 0020). */
export type EstadoComprobante = 'pendiente' | 'aprobado' | 'rechazado'

/**
 * Segmento de negocio del establecimiento (migración 0023).
 *
 * **Es descriptivo: no decide nada en la aplicación.** Se fija en el panel de
 * plataforma y se enseña como etiqueta en la Tienda del portal; ninguna
 * pantalla de la clínica lo consulta para cambiar su comportamiento.
 *
 * Quien decide qué se ve es el par **rol + `planes.modulos_habilitados`**
 * (migración 0024). Este comentario decía antes que «determina qué módulos se
 * muestran», y era falso: hizo esperar que cambiar el tipo de negocio cambiara
 * la interfaz, cuando lo que hay que cambiar es el plan.
 */
export type TipoNegocio =
  | 'veterinaria'           // Clínica médica completa (predeterminado)
  | 'peluqueria_canina'     // Estética y cuidado cosmético, sin historial clínico
  | 'petshop'               // Venta directa de productos, sin módulos clínicos
  | 'mixto_vet_peluqueria'  // Veterinaria completa + peluquería integrada
  | 'mixto_petshop_peluqueria' // PetShop + peluquería sin módulos clínicos

/**
 * Módulos que puede habilitar un plan (migración 0024).
 * Cada valor corresponde a una sección de la UI y sus servicios de datos.
 */
export type ModuloVetora =
  | 'agenda'             // Calendario y gestión de citas
  | 'caja'               // Cobros, turnos de caja y recibos
  | 'inventario'         // Control de stock (medicamentos, insumos, productos)
  | 'historial_clinico'  // Ficha SOAP, recetas, consentimientos
  | 'internacion'        // Hospitalización de pacientes (requiere historial_clinico)
  | 'asistente_ia'       // Copiloto de IA (Anthropic API)
  | 'portal_cliente'     // Acceso de los dueños a fichas de sus mascotas
  | 'whatsapp'           // Recordatorios y avisos automáticos por WhatsApp
  | 'metricas'           // Reportes de ingresos, citas y rendimiento
  | 'catalogo'           // Vitrina de productos, visible en la Tienda del portal
  | 'peluqueria'         // Módulo profesional de peluquería canina y felina
  | 'petshop'            // Módulo profesional de Pet Shop y Retail
  | 'fichas'             // Clientes y pacientes (0032). Una peluquería SÍ lo lleva
  | 'servicios'          // Catálogo de tarifas (0032). Un petshop cobra por `productos`

/**
 * Comprobante de pago de la suscripción.
 *
 * No hay pasarela: la clínica paga escaneando el QR de la plataforma y sube la
 * foto. El dueño de la plataforma la mira y aprueba, y aprobar avanza
 * `clinicas.proximo_cobro` tantos meses como cubra.
 */
export interface PagoSuscripcion {
  id: string
  clinica_id: string
  /** Meses de suscripción que cubre. */
  meses: number
  /**
   * Congelados al pagar, igual que los precios de `cobro_lineas`: si mañana
   * sube la tarifa o se mueve el cambio, el comprobante sigue diciendo lo que
   * se pagó y a cuánto.
   */
  monto_usd: number
  tipo_cambio_usd: number
  monto_bs: number
  /** Ruta en el bucket privado `comprobantes`: `{clinica_id}/{uuid}.jpg`. */
  ruta_comprobante: string
  /** Número de operación, tal como lo teclea quien paga. */
  referencia: string
  estado: EstadoComprobante
  /** Lo lee la clínica en su historial: no es una nota interna. */
  motivo_rechazo: string | null
  revisado_por: string | null
  revisado_at: string | null
  created_at: string
}

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
  /**
   * En **dólares** (migración 0019). La suscripción es lo único del sistema que
   * no está en bolivianos: lo que sostiene la plataforma se paga en dólares y
   * sus tarifas se mueven. La clínica paga el equivalente en Bs al cambio de
   * `configuracion_plataforma.tipo_cambio_usd`.
   */
  precio_mensual_usd: number
  whatsapp_limite: number
  max_sucursales: number
  max_usuarios: number
  /**
   * Módulos habilitados para este plan (migración 0024). Controla qué secciones
   * de la UI y qué servicios de datos puede usar la clínica suscripta.
   * Los planes de veterinaria existentes tienen todos los módulos por defecto.
   */
  modulos_habilitados: ModuloVetora[]
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
  /**
   * Mes al que pertenece el contador (`yyyy-MM-dd`, día 1). El tope es mensual
   * pero no se reinicia a medianoche: lo reinicia el primer envío del mes nuevo,
   * dentro de `consumir_cuota_whatsapp()`. Por eso hay que leerlo junto al
   * contador para saber cuánto se lleva gastado de verdad.
   */
  whatsapp_periodo: string
  /**
   * Segmento de negocio del establecimiento (migración 0023).
   * Determina qué módulos se muestran y qué flujo es el principal del sistema.
   * Valor por defecto: 'veterinaria' (todas las clínicas existentes).
   */
  tipo_negocio: TipoNegocio
  estado: EstadoClinica

  /**
   * Suscripción **en dólares**: lo pactado puede diferir del precio de lista
   * del plan. Se cobra convertido a bolivianos — ver `Plan.precio_mensual_usd`.
   */
  precio_acordado_usd: number
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

/**
 * Vitrina comercial de la clínica (migración 0027): lo que se ve en la Tienda
 * del portal del cliente, de cualquier clínica activa, no solo la propia.
 *
 * No es inventario — `Producto` es kardex por sucursal con dosificación
 * fraccionada; esto es a nivel de CLÍNICA, sin stock, pensado para mostrarse.
 */
export interface CatalogoProducto {
  id: string
  clinica_id: string
  nombre: string
  descripcion: string
  /** Texto libre: cada tipo de negocio agrupa sus productos de forma distinta. */
  categoria: string
  precio_bs: number
  /** Ruta en el bucket público `catalogo`, no la URL — puede no tener foto todavía. */
  foto_ruta: string | null
  /**
   * Producto del kardex del que se publicó esta ficha (0033), si salió de ahí.
   * Null en las creadas a mano desde `/catalogo`. Del producto se copian
   * nombre, categoría y precio de VENTA — nunca el costo ni el stock.
   */
  producto_id: string | null
  /** Se oculta de la Tienda sin borrarse, igual que `Servicio.activo`. */
  disponible: boolean
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
  ci: string | null
  created_at: string
}

export interface Paciente {
  id: string
  clinica_id: string
  cliente_id: string
  /**
   * Lo asigna el trigger `trg_codigo_paciente` en cada alta, pero las filas
   * anteriores a la migración 0006 no lo tienen — por eso su índice único es
   * parcial. Es nullable de verdad: no lo des por hecho antes de un `.slice()`.
   */
  codigo: string | null
  nombre: string
  especie: Especie
  raza: string | null
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
  /**
   * Consulta en la que se aplicó, si vino de una (0014 la hizo opcional).
   * Las que se registran desde el esquema sanitario van sin ella: el carné no
   * depende de que ese día se abriera un historial.
   */
  historial_id?: string | null
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
  /** Opcional desde 0014, igual que en `VacunaAplicada`. */
  historial_id?: string | null
  producto: string
  via: ViaDesparasitacion
  fecha_aplicacion: string
  /** Fecha de la siguiente dosis; alimenta los avisos programados (PRD Épica 4). */
  fecha_proxima?: string | null
  created_at: string
}

/**
 * ⚠️ NO TIENE TABLA DETRÁS. No la uses todavía.
 *
 * `examenes_laboratorio` no existe en ninguna de las once migraciones ni en el
 * tipo generado desde la base real: esta interfaz es el resto de una función a
 * medio cablear. El aviso `examen_listo` tiene etiqueta, ventana y plantilla en
 * `lib/asistente.ts` y color en `AsistentePage`, pero `services/programados.ts`
 * no lo emite nunca, así que no llega a fallar.
 *
 * Se conserva como documentación de la intención, no como contrato. Si alguien
 * "termina" la función apuntando a esa tabla, obtendrá
 * `PGRST205: Could not find the table 'public.examenes_laboratorio'` — el mismo
 * fallo que la migración 0008 tuvo que arreglar para `recetas`. Primero la
 * migración con su tabla y sus policies (personal + portal, como en 0008), y
 * después el código.
 */
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
  /**
   * Base64 del PNG firmado en pantalla táctil (0012). Nulos cuando el método no
   * es 'firma_digital' y en los consentimientos anteriores a esa migración.
   */
  firma_tutor?: string | null
  firma_veterinario?: string | null
  /** Congelados al firmar: el documento no se rehace si cambia la ficha. */
  nombre_tutor?: string | null
  nombre_veterinario?: string | null
  veterinario_id?: string | null
  created_at: string // Solo INSERT, nunca UPDATE/DELETE
}

/** 4. Inventario */

export type CategoriaRetail =
  | 'alimento'
  | 'medicamento'
  | 'antiparasitario'
  | 'suplemento'
  | 'higiene'
  | 'accesorio'
  | 'juguete'
  | 'ropa'
  | 'otro'

export interface Producto {
  id: string
  clinica_id: string
  sucursal_id: string
  sku: string
  nombre: string
  presentacion: string
  composicion: string
  unidad_medida: string
  contenido_presentacion: number
  costo_bs?: number | null
  precio_bs: number
  codigo_barras?: string | null
  categoria_retail?: CategoriaRetail | string | null
  marca?: string | null
  ubicacion?: string | null
  proveedor_id?: string | null
  requiere_lote?: boolean | null
  stock_actual: number // CHECK (stock_actual >= 0)
  stock_minimo: number
  stock_maximo?: number | null
  activo?: boolean | null
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
  lote_id?: string | null
  costo_unitario_bs?: number | null
  documento_origen?: string | null
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

/** 7. Peluquería / Estética Canina y Felina */

export type CategoriaGrooming = 'bano' | 'corte' | 'higiene' | 'tratamiento' | 'personalizado'
export type ComportamientoGrooming = 'tranquilo' | 'nervioso' | 'agresivo' | 'miedo_secadora' | 'no_tolera_unas' | 'manejo_especial'
export type NivelNudos = 'ninguno' | 'leve' | 'moderado' | 'severo'
export type NivelSuciedad = 'normal' | 'alta' | 'extrema'
export type EstadoOrdenPeluqueria =
  | 'cita'
  | 'recepcion'
  | 'evaluacion'
  | 'en_espera'
  | 'en_proceso'
  | 'terminada'
  | 'lista_recoger'
  | 'entregada'
  | 'cancelada'

export type TipoFotoGrooming = 'antes' | 'durante' | 'despues'
export type TipoComision = 'porcentaje' | 'monto_fijo'
export type EstadoComision = 'pendiente' | 'liquidada' | 'anulada'

export interface SuplementoOrden {
  concepto: string
  monto_bs: number
}

export interface ReglaPrecioServicio {
  tamano?: 'pequeno' | 'mediano' | 'grande' | 'gigante' | 'todos'
  especie?: 'canino' | 'felino' | 'todos'
  tipo_pelo?: string
  precio_bs: number
}

export interface PeluqueriaFicha {
  id: string
  clinica_id: string
  paciente_id: string
  corte_habitual?: string | null
  longitud_preferida?: string | null
  frecuencia_dias?: number | null
  productos_preferidos?: string | null
  comportamiento: ComportamientoGrooming
  alergias_sensibilidad?: string | null
  observaciones?: string | null
  updated_at: string
  created_at: string
}

export interface PeluqueriaServicioConfig {
  id: string
  clinica_id: string
  servicio_id: string
  duracion_minutos: number
  categoria_grooming: CategoriaGrooming
  especie_permitida: 'todos' | 'canino' | 'felino'
  tamano_permitido: 'todos' | 'pequeno' | 'mediano' | 'grande' | 'gigante'
  comision_tipo: TipoComision
  comision_valor: number
  reglas_precio: ReglaPrecioServicio[]
  activo: boolean
  created_at: string
}

export interface PeluqueriaServicioInsumo {
  id: string
  clinica_id: string
  servicio_id: string
  producto_id: string
  cantidad_dosis: number
  created_at: string
}

export interface PeluqueriaOrden {
  id: string
  clinica_id: string
  sucursal_id: string
  numero_orden: number
  cita_id?: string | null
  paciente_id: string
  cliente_id: string
  peluquero_id: string
  servicio_id?: string | null
  estado: EstadoOrdenPeluqueria
  condicion_pelaje?: string | null
  nivel_nudos: NivelNudos
  nivel_suciedad: NivelSuciedad
  lesiones_visibles?: string | null
  alerta_veterinaria: boolean
  comportamiento_recepcion?: string | null
  observaciones_recepcion?: string | null
  observaciones_peluquero?: string | null
  suplementos: SuplementoOrden[]
  precio_estimado_bs: number
  precio_final_bs: number
  insumos_descontados: boolean
  cobro_id?: string | null
  hora_ingreso: string
  hora_inicio?: string | null
  hora_fin?: string | null
  hora_entrega?: string | null
  creado_por?: string | null
  created_at: string
}

export interface PeluqueriaFoto {
  id: string
  clinica_id: string
  orden_id: string
  paciente_id: string
  tipo: TipoFotoGrooming
  foto_url: string
  notas?: string | null
  created_at: string
}

export interface PeluqueriaComision {
  id: string
  clinica_id: string
  sucursal_id: string
  orden_id: string
  peluquero_id: string
  monto_base_bs: number
  porcentaje_o_fijo: TipoComision
  monto_comision_bs: number
  estado: EstadoComision
  fecha_liquidacion?: string | null
  liquidada_por?: string | null
  created_at: string
}

export interface PeluqueriaConfiguracion {
  clinica_id: string
  tiempo_bloqueo_default_min: number
  intervalo_recordatorio_dias: number
  suplementos_predeterminados: SuplementoOrden[]
  mensaje_listo_whatsapp: string
  mensaje_recordatorio_whatsapp: string
  updated_at: string
}

/** 10. Pet Shop & Retail */

export interface Proveedor {
  id: string
  clinica_id: string
  empresa: string
  nit?: string | null
  contacto?: string | null
  telefono?: string | null
  whatsapp?: string | null
  direccion?: string | null
  email?: string | null
  notas?: string | null
  saldo_pendiente_bs: number
  activo: boolean
  created_at: string
}

export interface ProductoLote {
  id: string
  clinica_id: string
  sucursal_id: string
  producto_id: string
  numero_lote: string
  fecha_vencimiento: string
  cantidad_inicial: number
  cantidad_actual: number
  costo_unitario_bs: number
  proveedor_id?: string | null
  created_at: string
}

export type EstadoOrdenCompra = 'borrador' | 'solicitada' | 'recibida' | 'cancelada'

export interface OrdenCompra {
  id: string
  clinica_id: string
  sucursal_id: string
  proveedor_id: string
  numero_orden: string
  estado: EstadoOrdenCompra
  subtotal_bs: number
  descuento_bs: number
  total_bs: number
  notas?: string | null
  creado_por?: string | null
  recibido_por?: string | null
  fecha_solicitud?: string | null
  fecha_recepcion?: string | null
  created_at: string
}

export interface OrdenCompraDetalle {
  id: string
  clinica_id: string
  orden_id: string
  producto_id: string
  cantidad_pedida: number
  cantidad_recibida: number
  costo_unitario_bs: number
  subtotal_bs: number
  lote?: string | null
  fecha_vencimiento?: string | null
  created_at: string
}

export type TipoPromocionPetshop = 'porcentaje' | 'monto_fijo' | 'dos_por_uno' | 'combo' | 'cupon'

export interface CondicionesPromocion {
  productos_incluidos?: string[]
  categoria_retail?: CategoriaRetail
  cliente_id?: string
  combo_items?: { producto_id: string; cantidad: number }[]
  monto_minimo_bs?: number
}

export interface PetshopPromocion {
  id: string
  clinica_id: string
  titulo: string
  descripcion?: string | null
  tipo: TipoPromocionPetshop
  codigo_cupon?: string | null
  valor_descuento: number
  fecha_inicio: string
  fecha_fin: string
  activo: boolean
  limite_uso?: number | null
  usos_actuales: number
  condiciones: CondicionesPromocion
  created_at: string
}

export type EstadoProductoDevolucion = 'reintegrable' | 'danado' | 'descarte'

export interface PetshopDevolucion {
  id: string
  clinica_id: string
  sucursal_id: string
  cobro_id?: string | null
  producto_id: string
  cantidad: number
  motivo: string
  estado_producto: EstadoProductoDevolucion
  monto_devuelto_bs: number
  usuario_id?: string | null
  autorizado_por?: string | null
  created_at: string
}

export interface PetshopConfiguracion {
  id: string
  clinica_id: string
  dias_alerta_vencimiento: number
  permitir_venta_sin_stock: boolean
  exigir_autorizacion_devolucion: boolean
  impresion_ticket_automatica: boolean
  mensaje_ticket_pie: string
  created_at: string
}

