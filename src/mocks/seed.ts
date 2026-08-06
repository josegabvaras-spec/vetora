import type {
  Cita,
  Cliente,
  Clinica,
  ConsentimientoCirugia,
  Credencial,
  DesparasitacionAplicada,
  HistorialClinico,
  Internacion,
  Invitacion,
  MovimientoInventario,
  NotaInternacion,
  Paciente,
  Plan,
  Cobro,
  CobroLinea,
  Producto,
  RecetaItem,
  Servicio,
  Sucursal,
  TurnoCaja,
  Usuario,
  VacunaAplicada,
} from '../types/database'

// Datos de demostración para poder previsualizar el MVP sin un proyecto de
// Supabase real (ver isMockMode en src/lib/supabase.ts). La forma de los
// datos respeta exactamente el esquema del PRD §6.

const hoy = new Date()
const iso = (daysOffset: number, hour: number, minute = 0) => {
  const d = new Date(hoy)
  d.setDate(d.getDate() + daysOffset)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

export const CLINICA_DEMO_ID = 'clinica-1'
/** Segunda clínica: existe para poder comprobar que el aislamiento es real. */
export const CLINICA_SEGUNDA_ID = 'clinica-2'

const fecha = (daysOffset: number) => iso(daysOffset, 9).slice(0, 10)

/** Los tres planes del PRD §3, ya como datos editables desde el panel. */
export const seedPlanes: Plan[] = [
  {
    id: 'plan-consultorio',
    nombre: 'Consultorio',
    precio_mensual_bs: 199,
    whatsapp_limite: 100,
    max_sucursales: 1,
    max_usuarios: 2,
    activo: true,
    created_at: iso(-200, 8),
  },
  {
    id: 'plan-clinica',
    nombre: 'Clínica',
    precio_mensual_bs: 399,
    whatsapp_limite: 200,
    max_sucursales: 1,
    max_usuarios: 8,
    activo: true,
    created_at: iso(-200, 8),
  },
  {
    id: 'plan-multisede',
    nombre: 'Multi-sede',
    precio_mensual_bs: 799,
    whatsapp_limite: 500,
    max_sucursales: 5,
    max_usuarios: 25,
    activo: true,
    created_at: iso(-200, 8),
  },
]

export const seedClinicas: Clinica[] = [
  {
    id: CLINICA_DEMO_ID,
    nombre: 'Veterinaria San Jorge',
    plan_id: 'plan-multisede',
    responsable: 'Dra. Fabiola Rojas',
    whatsapp: '+591 70011223',
    ciudad: 'Tarija',
    whatsapp_mensajes_enviados: 42,
    estado: 'activa',
    precio_acordado_bs: 799,
    fecha_alta: fecha(-120),
    proximo_cobro: fecha(8),
    estado_pago: 'al_dia',
    created_at: iso(-120, 8),
  },
  // Un inquilino distinto, con su propio equipo y sus propios datos: sirve para
  // ver el panel con algo dentro y para comprobar que una clínica no ve la otra.
  {
    id: CLINICA_SEGUNDA_ID,
    nombre: 'Consultorio Patitas',
    plan_id: 'plan-consultorio',
    responsable: 'Dr. Iván Castro',
    whatsapp: '+591 79988776',
    ciudad: 'Tarija',
    whatsapp_mensajes_enviados: 8,
    estado: 'activa',
    precio_acordado_bs: 199,
    fecha_alta: fecha(-25),
    proximo_cobro: fecha(-3),
    estado_pago: 'en_mora',
    created_at: iso(-25, 8),
  },
]

/** Los accesos se generan desde el panel; no hay ninguno de ejemplo. */
export const seedInvitaciones: Invitacion[] = []

/**
 * Contraseña de las cuentas de demostración. El login la muestra en modo mock
 * para poder entrar de un clic; en producción no existe nada parecido, porque
 * cada persona crea la suya con su enlace de acceso.
 */
export const PASSWORD_DEMO = 'vetora2026'

const cred = (usuarioId: string, email: string, salt: string, hash: string) => ({
  id: `credencial-${usuarioId}`,
  usuario_id: usuarioId,
  email,
  salt,
  hash,
  actualizada_at: iso(-200, 8),
})

/**
 * Credenciales sembradas: hash PBKDF2 de `PASSWORD_DEMO` precomputado con la sal
 * de cada cuenta, para que el seed siga siendo un array estático (derivarlo en
 * caliente sería asíncrono). En producción esto es `auth.users` de Supabase.
 */
export const seedCredenciales: Credencial[] = [
  cred('user-plataforma', 'josegab.varas@gmail.com', 'sal-plataforma', 'b9602ad04595a5dd34b47ba2d8993a0f4ca8f9a212155412c56b1726e68b4796'),
  cred('user-admin', 'fabiola@sanjorge.bo', 'sal-admin', '632d36fe55e6e26a2deed49efad639d190cc505d4e1e8da061cd3fba6a569913'),
  cred('user-vet', 'marcelo@sanjorge.bo', 'sal-vet', 'efee08e64574f061891be0fd05e81be21a621bb0271491860493eda3a838b0a5'),
  cred('user-recepcion', 'andrea@sanjorge.bo', 'sal-recepcion', '73cec705ef223bf703e5123f01e0526a250782c4bc2433af8fd26f5dac13e66d'),
  cred('user-patitas-admin', 'ivan@patitas.bo', 'sal-patitas', '138e48333dce69073471b772068c0a73130d05201bbe30b028ed43ca1efd1dc9'),
]

export const seedTurnosCaja: TurnoCaja[] = []
export const seedCobros: Cobro[] = []
export const seedCobroLineas: CobroLinea[] = []

/**
 * Catálogo inicial: el administrador lo edita desde la pantalla de Servicios.
 * Los ids son explícitos (no posicionales) porque otras filas del seed los
 * referencian: qué cirugía se agendó, qué tarifa diaria paga una internación.
 */
const catalogoInicial: [id: string, nombre: string, categoria: Servicio['categoria'], precio: number][] = [
  ['servicio-consulta-general', 'Consulta general', 'consulta', 80],
  ['servicio-consulta-urgencia', 'Consulta de urgencia', 'consulta', 150],
  ['servicio-reconsulta', 'Reconsulta (control)', 'consulta', 40],
  ['servicio-control-post', 'Control post-operatorio', 'consulta', 60],

  ['servicio-ovh', 'Esterilización — ovariohisterectomía (OVH)', 'cirugia', 350],
  ['servicio-orquiectomia', 'Castración — orquiectomía', 'cirugia', 280],
  ['servicio-cesarea', 'Cesárea', 'cirugia', 600],
  ['servicio-tumor', 'Extirpación de tumor o masa', 'cirugia', 500],
  ['servicio-dental', 'Profilaxis dental con anestesia', 'cirugia', 250],
  ['servicio-osteosintesis', 'Osteosíntesis por fractura', 'cirugia', 900],
  ['servicio-hernia', 'Herniorrafia (umbilical o inguinal)', 'cirugia', 400],
  ['servicio-cuerpo-extrano', 'Enterotomía por cuerpo extraño', 'cirugia', 750],
  ['servicio-otohematoma', 'Drenaje de otohematoma', 'cirugia', 220],
  ['servicio-oftalmica', 'Cirugía oftálmica (párpado o tercer párpado)', 'cirugia', 450],
  ['servicio-amputacion', 'Amputación de miembro', 'cirugia', 700],
  ['servicio-tejidos-blandos', 'Cirugía de tejidos blandos', 'cirugia', 500],

  ['servicio-hemograma', 'Hemograma completo', 'laboratorio', 90],
  ['servicio-bioquimico', 'Perfil bioquímico', 'laboratorio', 140],
  ['servicio-copro', 'Coproparasitológico', 'laboratorio', 60],

  ['servicio-ecografia', 'Ecografía abdominal', 'imagenologia', 150],
  ['servicio-radiografia', 'Radiografía simple', 'imagenologia', 120],

  ['servicio-internacion-dia', 'Día de internación', 'internacion', 120],
  ['servicio-internacion-aislamiento', 'Día de internación en aislamiento', 'internacion', 180],
  ['servicio-internacion-uci', 'Día de internación en cuidados intensivos', 'internacion', 250],

  ['servicio-vacuna', 'Aplicación de vacuna', 'otros', 30],
  ['servicio-certificado', 'Certificado de salud', 'otros', 50],
]

export const seedServicios: Servicio[] = [
  ...catalogoInicial.map(([id, nombre, categoria, precio]) => ({
    id,
    clinica_id: CLINICA_DEMO_ID,
    nombre,
    categoria,
    precio_bs: precio,
    activo: true,
    created_at: iso(-120, 8),
  })),
  // La segunda clínica tiene su propio catálogo, con sus propios precios.
  {
    id: 'servicio-p-consulta',
    clinica_id: CLINICA_SEGUNDA_ID,
    nombre: 'Consulta general',
    categoria: 'consulta' as Servicio['categoria'],
    precio_bs: 70,
    activo: true,
    created_at: iso(-25, 8),
  },
  {
    id: 'servicio-p-vacuna',
    clinica_id: CLINICA_SEGUNDA_ID,
    nombre: 'Aplicación de vacuna',
    categoria: 'otros' as Servicio['categoria'],
    precio_bs: 25,
    activo: true,
    created_at: iso(-25, 8),
  },
]

export const seedSucursales: Sucursal[] = [
  {
    id: 'sucursal-centro',
    clinica_id: CLINICA_DEMO_ID,
    nombre: 'Sucursal Centro',
    direccion: 'Calle Ingavi #456, Tarija',
    created_at: iso(-120, 8),
  },
  {
    id: 'sucursal-norte',
    clinica_id: CLINICA_DEMO_ID,
    nombre: 'Sucursal Aranjuez',
    direccion: 'Av. Circunvalación km 2, Tarija',
    created_at: iso(-90, 8),
  },
  {
    id: 'sucursal-patitas',
    clinica_id: CLINICA_SEGUNDA_ID,
    nombre: 'Consultorio Patitas',
    direccion: 'Av. La Paz #120, Tarija',
    created_at: iso(-25, 8),
  },
]

export const seedUsuarios: Usuario[] = [
  // Dueño de la plataforma: sin clínica, no entra a datos de ningún inquilino.
  {
    id: 'user-plataforma',
    clinica_id: null,
    sucursal_id: null,
    nombre: 'José Gabriel Varas',
    email: 'josegab.varas@gmail.com',
    whatsapp: '+591 60000000',
    rol: 'superadmin',
    activo: true,
    created_at: iso(-200, 8),
  },
  {
    id: 'user-admin',
    clinica_id: CLINICA_DEMO_ID,
    sucursal_id: null,
    nombre: 'Dra. Fabiola Rojas',
    email: 'fabiola@sanjorge.bo',
    whatsapp: '+591 70011223',
    rol: 'admin',
    activo: true,
    created_at: iso(-120, 8),
  },
  {
    id: 'user-vet',
    clinica_id: CLINICA_DEMO_ID,
    sucursal_id: 'sucursal-centro',
    nombre: 'Dr. Marcelo Vaca',
    email: 'marcelo@sanjorge.bo',
    whatsapp: '+591 70011224',
    rol: 'veterinario',
    activo: true,
    created_at: iso(-100, 8),
  },
  {
    id: 'user-recepcion',
    clinica_id: CLINICA_DEMO_ID,
    sucursal_id: 'sucursal-centro',
    nombre: 'Andrea Mendoza',
    email: 'andrea@sanjorge.bo',
    whatsapp: '+591 70011225',
    rol: 'recepcion',
    activo: true,
    created_at: iso(-100, 8),
  },
  {
    id: 'user-patitas-admin',
    clinica_id: CLINICA_SEGUNDA_ID,
    sucursal_id: null,
    nombre: 'Dr. Iván Castro',
    email: 'ivan@patitas.bo',
    whatsapp: '+591 79988776',
    rol: 'admin',
    activo: true,
    created_at: iso(-25, 8),
  },
]

export const seedClientes: Cliente[] = [
  {
    id: 'cliente-1',
    clinica_id: CLINICA_DEMO_ID,
    nombre: 'Juan Pérez',
    whatsapp: '+591 71234567',
    ci: '4567123 TJ',
    created_at: iso(-80, 9),
  },
  {
    id: 'cliente-2',
    clinica_id: CLINICA_DEMO_ID,
    nombre: 'María Fernández',
    whatsapp: '+591 76543210',
    ci: '5891234 TJ',
    created_at: iso(-60, 9),
  },
  {
    id: 'cliente-3',
    clinica_id: CLINICA_DEMO_ID,
    nombre: 'Carlos Gutiérrez',
    whatsapp: '+591 78889900',
    ci: '3321098 TJ',
    created_at: iso(-40, 9),
  },
]

export const seedPacientes: Paciente[] = [
  {
    id: 'paciente-1',
    clinica_id: CLINICA_DEMO_ID,
    cliente_id: 'cliente-1',
    codigo: 'MAS-001',
    nombre: 'Max',
    especie: 'canino',
    raza: 'Labrador',
    sexo: 'macho',
    fecha_nacimiento: '2021-03-14',
    alergias: 'Penicilina',
    antecedentes: 'Displasia de cadera leve diagnosticada en 2024.',
    created_at: iso(-80, 9),
  },
  {
    id: 'paciente-2',
    clinica_id: CLINICA_DEMO_ID,
    cliente_id: 'cliente-2',
    codigo: 'MAS-002',
    nombre: 'Luna',
    especie: 'felino',
    raza: 'Siamés',
    sexo: 'hembra',
    fecha_nacimiento: '2022-07-02',
    alergias: null,
    antecedentes: null,
    created_at: iso(-60, 9),
  },
  {
    id: 'paciente-3',
    clinica_id: CLINICA_DEMO_ID,
    cliente_id: 'cliente-3',
    codigo: 'MAS-003',
    nombre: 'Rocky',
    especie: 'canino',
    raza: 'Pastor Alemán',
    sexo: 'macho',
    fecha_nacimiento: '2019-11-20',
    alergias: null,
    antecedentes: 'Cirugía de esterilización en 2023.',
    created_at: iso(-40, 9),
  },
]

export const seedCitas: Cita[] = [
  {
    id: 'cita-1',
    clinica_id: CLINICA_DEMO_ID,
    sucursal_id: 'sucursal-centro',
    paciente_id: 'paciente-1',
    veterinario_id: 'user-vet',
    fecha_hora: iso(0, 10, 30),
    tipo_cita: 'cirugia',
    estado: 'confirmada',
    servicio_id: 'servicio-ovh',
    notas: 'Esterilización programada.',
    recordatorio_enviado: true,
    created_at: iso(-5, 9),
  },
  {
    id: 'cita-2',
    clinica_id: CLINICA_DEMO_ID,
    sucursal_id: 'sucursal-centro',
    paciente_id: 'paciente-2',
    veterinario_id: 'user-vet',
    fecha_hora: iso(0, 13, 0),
    tipo_cita: 'consulta',
    estado: 'pendiente',
    notas: 'Control de rutina.',
    recordatorio_enviado: false,
    created_at: iso(-2, 9),
  },
  {
    id: 'cita-3',
    clinica_id: CLINICA_DEMO_ID,
    sucursal_id: 'sucursal-centro',
    paciente_id: 'paciente-3',
    veterinario_id: 'user-vet',
    fecha_hora: iso(1, 9, 0),
    tipo_cita: 'vacuna',
    estado: 'pendiente',
    notas: 'Refuerzo antirrábico anual.',
    recordatorio_enviado: false,
    created_at: iso(-1, 9),
  },
  {
    id: 'cita-4',
    clinica_id: CLINICA_DEMO_ID,
    sucursal_id: 'sucursal-centro',
    paciente_id: 'paciente-1',
    veterinario_id: 'user-vet',
    fecha_hora: iso(-3, 11, 0),
    tipo_cita: 'consulta',
    estado: 'completada',
    notas: null,
    recordatorio_enviado: true,
    created_at: iso(-10, 9),
  },
  // Control de la consulta anterior: una reconsulta siempre apunta a la cita
  // que está controlando (cita_origen_id).
  {
    id: 'cita-5',
    clinica_id: CLINICA_DEMO_ID,
    sucursal_id: 'sucursal-centro',
    paciente_id: 'paciente-1',
    veterinario_id: 'user-vet',
    fecha_hora: iso(2, 9, 30),
    tipo_cita: 'reconsulta',
    estado: 'pendiente',
    cita_origen_id: 'cita-4',
    notas: 'Control del chequeo general.',
    recordatorio_enviado: false,
    created_at: iso(-3, 12),
  },
  // Desparasitación de hace un trimestre: es la que deja la siguiente dosis
  // vencida, para que el asistente tenga un aviso real que mostrar al entrar.
  {
    id: 'cita-6',
    clinica_id: CLINICA_DEMO_ID,
    sucursal_id: 'sucursal-centro',
    paciente_id: 'paciente-2',
    veterinario_id: 'user-vet',
    fecha_hora: iso(-100, 10, 0),
    tipo_cita: 'desparasitacion',
    estado: 'completada',
    notas: null,
    recordatorio_enviado: true,
    created_at: iso(-105, 9),
  },
]

export const seedHistorial: HistorialClinico[] = [
  {
    id: 'historial-1',
    clinica_id: CLINICA_DEMO_ID,
    paciente_id: 'paciente-1',
    cita_id: 'cita-4',
    veterinario_id: 'user-vet',
    motivo: 'Chequeo general anual',
    sintomas: 'Ninguno reportado',
    diagnostico: 'Paciente sano, peso adecuado.',
    tratamiento: 'Sin tratamiento. Se recomienda control en 6 meses.',
    peso_kg: 28.4,
    temperatura_c: 38.5,
    frecuencia_cardiaca: 92,
    editable: false,
    created_at: iso(-3, 11, 40),
  },
  {
    id: 'historial-2',
    clinica_id: CLINICA_DEMO_ID,
    paciente_id: 'paciente-3',
    cita_id: 'cita-3',
    veterinario_id: 'user-vet',
    motivo: 'Herida leve en pata trasera',
    sintomas: 'Cojera leve, sin sangrado activo',
    diagnostico: '',
    tratamiento: '',
    peso_kg: null,
    temperatura_c: null,
    frecuencia_cardiaca: null,
    editable: true,
    created_at: iso(-1, 9, 15),
  },
  {
    id: 'historial-3',
    clinica_id: CLINICA_DEMO_ID,
    paciente_id: 'paciente-2',
    cita_id: 'cita-6',
    veterinario_id: 'user-vet',
    motivo: 'Desparasitación trimestral',
    sintomas: 'Sin sintomatología',
    diagnostico: 'Paciente sano. Desparasitación de rutina.',
    tratamiento: 'Antiparasitario oral, dosis única.',
    peso_kg: 5.2,
    temperatura_c: 38.2,
    frecuencia_cardiaca: 120,
    editable: false,
    created_at: iso(-100, 10, 20),
  },
]

export const seedConsentimientos: ConsentimientoCirugia[] = []

export const seedVacunas: VacunaAplicada[] = [
  {
    id: 'vacuna-1',
    clinica_id: CLINICA_DEMO_ID,
    paciente_id: 'paciente-1',
    historial_id: 'historial-1',
    nombre_vacuna: 'Antirrábica',
    fecha_aplicacion: iso(-3, 11, 45).slice(0, 10),
    fecha_refuerzo: iso(362, 9).slice(0, 10),
    created_at: iso(-3, 11, 45),
  },
]

export const seedDesparasitaciones: DesparasitacionAplicada[] = [
  // Vencida: la siguiente dosis tocaba hace ocho días. Es el aviso que el
  // asistente encuentra al entrar sin que haya que preparar nada.
  {
    id: 'desparasitacion-1',
    clinica_id: CLINICA_DEMO_ID,
    paciente_id: 'paciente-2',
    historial_id: 'historial-3',
    producto: 'Praziquantel + Pirantel',
    via: 'oral',
    fecha_aplicacion: fecha(-100),
    fecha_proxima: fecha(-8),
    created_at: iso(-100, 10, 25),
  },
  {
    id: 'desparasitacion-2',
    clinica_id: CLINICA_DEMO_ID,
    paciente_id: 'paciente-1',
    historial_id: 'historial-1',
    producto: 'Fenbendazol',
    via: 'oral',
    fecha_aplicacion: fecha(-3),
    fecha_proxima: fecha(87),
    created_at: iso(-3, 11, 50),
  },
]

export const seedProductos: Producto[] = [
  {
    id: 'producto-1',
    clinica_id: CLINICA_DEMO_ID,
    sucursal_id: 'sucursal-centro',
    sku: 'VAC-ANTI-001',
    nombre: 'Vacuna Antirrábica',
    precio_bs: 45,
    stock_actual: 1,
    stock_minimo: 3,
    created_at: iso(-90, 8),
  },
  {
    id: 'producto-2',
    clinica_id: CLINICA_DEMO_ID,
    sucursal_id: 'sucursal-centro',
    sku: 'DESP-CAN-010',
    nombre: 'Desparasitante Canino',
    precio_bs: 30,
    stock_actual: 0,
    stock_minimo: 3,
    created_at: iso(-90, 8),
  },
  {
    id: 'producto-3',
    clinica_id: CLINICA_DEMO_ID,
    sucursal_id: 'sucursal-centro',
    sku: 'ALIM-PREM-020',
    nombre: 'Alimento Premium 15kg',
    precio_bs: 210,
    stock_actual: 25,
    stock_minimo: 5,
    created_at: iso(-90, 8),
  },
  {
    id: 'producto-4',
    clinica_id: CLINICA_DEMO_ID,
    sucursal_id: 'sucursal-centro',
    sku: 'JER-DESC-005',
    nombre: 'Jeringas Descartables (caja)',
    precio_bs: 25,
    stock_actual: 2,
    stock_minimo: 3,
    created_at: iso(-90, 8),
  },
  {
    id: 'producto-5',
    clinica_id: CLINICA_DEMO_ID,
    sucursal_id: 'sucursal-norte',
    sku: 'VAC-ANTI-001',
    nombre: 'Vacuna Antirrábica',
    precio_bs: 45,
    stock_actual: 12,
    stock_minimo: 3,
    created_at: iso(-60, 8),
  },
]

export const seedMovimientos: MovimientoInventario[] = [
  {
    id: 'mov-1',
    clinica_id: CLINICA_DEMO_ID,
    producto_id: 'producto-1',
    tipo: 'ingreso',
    cantidad: 10,
    motivo: 'Compra a proveedor Vetbol',
    cita_id: null,
    internacion_id: null,
    created_at: iso(-30, 9),
  },
  {
    id: 'mov-2',
    clinica_id: CLINICA_DEMO_ID,
    producto_id: 'producto-1',
    tipo: 'egreso',
    cantidad: 9,
    motivo: 'Aplicación en consultas',
    cita_id: null,
    internacion_id: null,
    created_at: iso(-2, 9),
  },
  // Consumo durante la internación en curso: se factura al dar de alta.
  {
    id: 'mov-3',
    clinica_id: CLINICA_DEMO_ID,
    producto_id: 'producto-4',
    tipo: 'egreso',
    cantidad: 1,
    motivo: 'Usado en internación: Gastroenteritis hemorrágica',
    cita_id: null,
    internacion_id: 'internacion-1',
    created_at: iso(-2, 10),
  },
]

/** Una internación en curso, para que la sala de internación no arranque vacía. */
export const seedInternaciones: Internacion[] = [
  {
    id: 'internacion-1',
    clinica_id: CLINICA_DEMO_ID,
    sucursal_id: 'sucursal-centro',
    paciente_id: 'paciente-3',
    veterinario_id: 'user-vet',
    cita_id: null,
    motivo: 'Gastroenteritis hemorrágica con deshidratación moderada',
    jaula: 'Box 2',
    fecha_ingreso: iso(-2, 8, 30),
    fecha_alta: null,
    servicio_dia_id: 'servicio-internacion-dia',
    precio_dia_bs: 120,
    indicaciones_alta: null,
    estado: 'internado',
    created_at: iso(-2, 8, 30),
  },
]

export const seedNotasInternacion: NotaInternacion[] = [
  {
    id: 'nota-internacion-1',
    clinica_id: CLINICA_DEMO_ID,
    internacion_id: 'internacion-1',
    veterinario_id: 'user-vet',
    nota: 'Ingresa decaído, con vómitos y diarrea con sangre. Se instaura fluidoterapia con Ringer lactato y antiemético.',
    temperatura_c: 39.4,
    frecuencia_cardiaca: 128,
    frecuencia_respiratoria: 34,
    peso_kg: 31.2,
    created_at: iso(-2, 9),
  },
  {
    id: 'nota-internacion-2',
    clinica_id: CLINICA_DEMO_ID,
    internacion_id: 'internacion-1',
    veterinario_id: 'user-vet',
    nota: 'Mejor estado general, cesaron los vómitos. Heces aún blandas. Se mantiene fluidoterapia y se prueba dieta blanda.',
    temperatura_c: 38.7,
    frecuencia_cardiaca: 104,
    frecuencia_respiratoria: 28,
    peso_kg: 31.0,
    created_at: iso(-1, 9),
  },
]

/** Recetas: vacío al iniciar la demo; se generan desde la ficha clínica. */
export const seedRecetas: RecetaItem[] = []
