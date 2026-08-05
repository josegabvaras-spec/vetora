import { db, newId } from '../mocks/db'
import type { Clinica, EstadoClinica, Rol, Sucursal, Usuario } from '../types/database'
import type { ClinicaConDetalle, LimitesClinica, ResumenPlataforma } from '../types/views'
import { getPlan } from './planes'
import { exigirEmailLibre } from './cuentas'

// Servicios del dueño de la plataforma: dar de alta clínicas que contratan,
// asignarles plan, controlar cobros y suspensiones, y gestionar sus usuarios.
// Nunca abre datos clínicos de un inquilino: solo su cuenta y su consumo.

function delay<T>(value: T): Promise<T> {
  return Promise.resolve(value)
}

function exigirClinica(clinicaId: string): Clinica {
  const clinica = db.get('clinicas').find((c) => c.id === clinicaId)
  if (!clinica) throw new Error('Clínica no encontrada')
  return clinica
}

/**
 * Consumo de la clínica frente a los topes de su plan. Es la única fuente:
 * la usan tanto las validaciones que bloquean como el panel que muestra el
 * número, para que nunca digan cosas distintas.
 */
export function limitesDe(clinicaId: string): LimitesClinica {
  const clinica = exigirClinica(clinicaId)
  const plan = getPlan(clinica.plan_id)
  if (!plan) throw new Error('La clínica no tiene un plan válido asignado')

  return {
    plan,
    sucursales: {
      usados: db.get('sucursales').filter((s) => s.clinica_id === clinicaId).length,
      maximo: plan.max_sucursales,
    },
    usuarios: {
      usados: db.get('usuarios').filter((u) => u.clinica_id === clinicaId).length,
      maximo: plan.max_usuarios,
    },
    whatsapp: { usados: clinica.whatsapp_mensajes_enviados, maximo: plan.whatsapp_limite },
  }
}

function detalleDeClinica(clinica: Clinica): ClinicaConDetalle {
  const limites = limitesDe(clinica.id)
  return {
    ...clinica,
    plan_nombre: limites.plan.nombre,
    precio_lista_bs: limites.plan.precio_mensual_bs,
    limites,
    total_pacientes: db.get('pacientes').filter((p) => p.clinica_id === clinica.id).length,
    total_citas: db.get('citas').filter((c) => c.clinica_id === clinica.id).length,
    usuarios: db
      .get('usuarios')
      .filter((u) => u.clinica_id === clinica.id)
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
  }
}

export async function listClinicas(): Promise<ClinicaConDetalle[]> {
  const result = db
    .get('clinicas')
    .map(detalleDeClinica)
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
  return delay(result)
}

export async function getClinica(clinicaId: string): Promise<ClinicaConDetalle | null> {
  const clinica = db.get('clinicas').find((c) => c.id === clinicaId)
  return delay(clinica ? detalleDeClinica(clinica) : null)
}

export async function resumenPlataforma(): Promise<ResumenPlataforma> {
  const clinicas = db.get('clinicas')
  const activas = clinicas.filter((c) => c.estado === 'activa')
  const enMora = clinicas.filter((c) => c.estado_pago === 'en_mora')

  return delay({
    clinicas_activas: activas.length,
    clinicas_suspendidas: clinicas.filter((c) => c.estado === 'suspendida').length,
    ingreso_mensual_bs: Number(activas.reduce((n, c) => n + c.precio_acordado_bs, 0).toFixed(2)),
    en_mora: enMora.length,
    importe_en_mora_bs: Number(enMora.reduce((n, c) => n + c.precio_acordado_bs, 0).toFixed(2)),
    whatsapp_enviados: clinicas.reduce((n, c) => n + c.whatsapp_mensajes_enviados, 0),
    whatsapp_limite: clinicas.reduce((n, c) => n + (getPlan(c.plan_id)?.whatsapp_limite ?? 0), 0),
  })
}

export interface DatosClinica {
  nombre: string
  responsable: string
  whatsapp: string
  ciudad: string
  plan_id: string
  precio_acordado_bs: number
  proximo_cobro: string
}

/** Mínimo para que `wa.me` pueda abrir un chat: un número reconocible. */
function exigirWhatsapp(valor: string, deQuien: string) {
  const digitos = valor.replace(/\D/g, '')
  if (digitos.length < 8) {
    throw new Error(`Indica el WhatsApp ${deQuien}: es por donde se envía el enlace de acceso`)
  }
}

function validarClinica(datos: DatosClinica, ignorarId?: string) {
  if (!datos.nombre.trim()) throw new Error('El nombre de la clínica no puede quedar vacío')
  if (!datos.responsable.trim()) throw new Error('Indica quién es el responsable de la cuenta')
  exigirWhatsapp(datos.whatsapp, 'de la clínica')
  if (!getPlan(datos.plan_id)) throw new Error('Elige un plan válido')
  if (!Number.isFinite(datos.precio_acordado_bs) || datos.precio_acordado_bs < 0) {
    throw new Error('El precio acordado debe ser un número mayor o igual a 0')
  }
  const repetido = db
    .get('clinicas')
    .some((c) => c.id !== ignorarId && c.nombre.trim().toLowerCase() === datos.nombre.trim().toLowerCase())
  if (repetido) throw new Error('Ya existe una clínica con ese nombre')
}

export interface AltaClinicaInput extends DatosClinica {
  /** Primera sucursal: una clínica sin sucursal no puede agendar ni facturar. */
  sucursalNombre: string
  sucursalDireccion: string
  /** Administrador con el que la clínica arranca. */
  adminNombre: string
  /** Su cuenta de acceso: crea la contraseña con el enlace que recibe. */
  adminEmail: string
  /** Por aquí recibirá su enlace de acceso. */
  adminWhatsapp: string
}

export interface AltaClinicaResultado {
  clinica: Clinica
  /** Se devuelve para poder mandarle el acceso en el mismo acto del alta. */
  admin: Usuario
}

/**
 * Da de alta a quien contrata el servicio. Crea la clínica, su primera sucursal
 * y su usuario administrador en un solo acto: cualquiera de las tres cosas por
 * separado deja una cuenta inservible.
 */
export async function crearClinica(input: AltaClinicaInput): Promise<AltaClinicaResultado> {
  validarClinica(input)
  if (!input.sucursalNombre.trim()) throw new Error('Indica el nombre de la primera sucursal')
  if (!input.adminNombre.trim()) throw new Error('Indica el nombre del administrador de la clínica')
  exigirWhatsapp(input.adminWhatsapp, 'del administrador')
  const adminEmail = exigirEmailLibre(input.adminEmail)

  const hoy = new Date().toISOString().slice(0, 10)
  const clinica: Clinica = {
    id: newId('clinica'),
    nombre: input.nombre.trim(),
    plan_id: input.plan_id,
    responsable: input.responsable.trim(),
    whatsapp: input.whatsapp.trim(),
    ciudad: input.ciudad.trim() || 'Tarija',
    whatsapp_mensajes_enviados: 0,
    estado: 'activa',
    precio_acordado_bs: input.precio_acordado_bs,
    fecha_alta: hoy,
    proximo_cobro: input.proximo_cobro || hoy,
    estado_pago: 'al_dia',
    created_at: new Date().toISOString(),
  }
  db.set('clinicas', [...db.get('clinicas'), clinica])

  const sucursal: Sucursal = {
    id: newId('sucursal'),
    clinica_id: clinica.id,
    nombre: input.sucursalNombre.trim(),
    direccion: input.sucursalDireccion.trim(),
    created_at: new Date().toISOString(),
  }
  db.set('sucursales', [...db.get('sucursales'), sucursal])

  const admin: Usuario = {
    id: newId('user'),
    clinica_id: clinica.id,
    sucursal_id: null,
    nombre: input.adminNombre.trim(),
    email: adminEmail,
    whatsapp: input.adminWhatsapp.trim(),
    rol: 'admin',
    activo: true,
    created_at: new Date().toISOString(),
  }
  db.set('usuarios', [...db.get('usuarios'), admin])

  return delay({ clinica, admin })
}

export async function actualizarClinica(clinicaId: string, datos: DatosClinica): Promise<void> {
  exigirClinica(clinicaId)
  validarClinica(datos, clinicaId)

  // Bajar de plan no puede dejar a la clínica por encima de los nuevos topes.
  const plan = getPlan(datos.plan_id)!
  const limites = limitesDe(clinicaId)
  if (limites.sucursales.usados > plan.max_sucursales) {
    throw new Error(
      `La clínica tiene ${limites.sucursales.usados} sucursales y el plan ${plan.nombre} permite ${plan.max_sucursales}`,
    )
  }
  if (limites.usuarios.usados > plan.max_usuarios) {
    throw new Error(
      `La clínica tiene ${limites.usuarios.usados} usuarios y el plan ${plan.nombre} permite ${plan.max_usuarios}`,
    )
  }

  db.set(
    'clinicas',
    db.get('clinicas').map((c) =>
      c.id === clinicaId
        ? {
            ...c,
            nombre: datos.nombre.trim(),
            responsable: datos.responsable.trim(),
            whatsapp: datos.whatsapp.trim(),
            ciudad: datos.ciudad.trim(),
            plan_id: datos.plan_id,
            precio_acordado_bs: datos.precio_acordado_bs,
            proximo_cobro: datos.proximo_cobro,
          }
        : c,
    ),
  )
  return delay(undefined)
}

/** Suspender corta el acceso de todos sus usuarios sin borrar nada. */
export async function cambiarEstadoClinica(clinicaId: string, estado: EstadoClinica): Promise<void> {
  exigirClinica(clinicaId)
  db.set(
    'clinicas',
    db.get('clinicas').map((c) => (c.id === clinicaId ? { ...c, estado } : c)),
  )
  return delay(undefined)
}

/** Registra el cobro del mes: pone la cuenta al día y corre el próximo cobro. */
export async function marcarCobroAlDia(clinicaId: string, proximoCobro: string): Promise<void> {
  exigirClinica(clinicaId)
  db.set(
    'clinicas',
    db.get('clinicas').map((c) =>
      c.id === clinicaId ? { ...c, estado_pago: 'al_dia', proximo_cobro: proximoCobro } : c,
    ),
  )
  return delay(undefined)
}

export async function marcarEnMora(clinicaId: string): Promise<void> {
  exigirClinica(clinicaId)
  db.set(
    'clinicas',
    db.get('clinicas').map((c) => (c.id === clinicaId ? { ...c, estado_pago: 'en_mora' } : c)),
  )
  return delay(undefined)
}

/** Alta de sucursal, sujeta al tope del plan contratado. */
export async function crearSucursal(clinicaId: string, nombre: string, direccion: string): Promise<Sucursal> {
  const limites = limitesDe(clinicaId)
  if (!nombre.trim()) throw new Error('Indica el nombre de la sucursal')
  if (limites.sucursales.usados >= limites.sucursales.maximo) {
    throw new Error(
      `El plan ${limites.plan.nombre} permite ${limites.plan.max_sucursales} sucursal(es). Sube de plan para agregar otra.`,
    )
  }

  const sucursal: Sucursal = {
    id: newId('sucursal'),
    clinica_id: clinicaId,
    nombre: nombre.trim(),
    direccion: direccion.trim(),
    created_at: new Date().toISOString(),
  }
  db.set('sucursales', [...db.get('sucursales'), sucursal])
  return delay(sucursal)
}

export interface DatosUsuario {
  nombre: string
  /** Identifica su cuenta: es con lo que inicia sesión. */
  email: string
  /** Obligatorio: por aquí se le manda el enlace para entrar al sistema. */
  whatsapp: string
  rol: Rol
  sucursal_id: string | null
}

/** Alta de usuario de una clínica, sujeta al tope del plan contratado. */
export async function crearUsuario(clinicaId: string, datos: DatosUsuario): Promise<Usuario> {
  const limites = limitesDe(clinicaId)
  if (!datos.nombre.trim()) throw new Error('Indica el nombre del usuario')
  exigirWhatsapp(datos.whatsapp, 'del usuario')
  const email = exigirEmailLibre(datos.email)
  if (datos.rol === 'superadmin') throw new Error('El rol de plataforma no se asigna a una clínica')
  if (limites.usuarios.usados >= limites.usuarios.maximo) {
    throw new Error(
      `El plan ${limites.plan.nombre} permite ${limites.plan.max_usuarios} usuarios. Sube de plan para agregar otro.`,
    )
  }

  const usuario: Usuario = {
    id: newId('user'),
    clinica_id: clinicaId,
    sucursal_id: datos.sucursal_id,
    nombre: datos.nombre.trim(),
    email,
    whatsapp: datos.whatsapp.trim(),
    rol: datos.rol,
    activo: true,
    created_at: new Date().toISOString(),
  }
  db.set('usuarios', [...db.get('usuarios'), usuario])
  return delay(usuario)
}

export async function actualizarUsuario(usuarioId: string, datos: DatosUsuario): Promise<void> {
  const usuario = db.get('usuarios').find((u) => u.id === usuarioId)
  if (!usuario) throw new Error('Usuario no encontrado')
  if (!datos.nombre.trim()) throw new Error('Indica el nombre del usuario')
  exigirWhatsapp(datos.whatsapp, 'del usuario')
  const email = exigirEmailLibre(datos.email, usuarioId)
  if (datos.rol === 'superadmin') throw new Error('El rol de plataforma no se asigna a una clínica')

  db.set(
    'usuarios',
    db.get('usuarios').map((u) =>
      u.id === usuarioId
        ? {
            ...u,
            nombre: datos.nombre.trim(),
            email,
            whatsapp: datos.whatsapp.trim(),
            rol: datos.rol,
            sucursal_id: datos.sucursal_id,
          }
        : u,
    ),
  )
  return delay(undefined)
}

/**
 * Activa o desactiva un usuario. No se borra: firma historiales y cobros, y
 * esos registros son inmutables.
 */
export async function alternarActivoUsuario(usuarioId: string): Promise<void> {
  const usuario = db.get('usuarios').find((u) => u.id === usuarioId)
  if (!usuario) throw new Error('Usuario no encontrado')
  if (usuario.rol === 'superadmin') throw new Error('El usuario de plataforma no puede desactivarse')

  // Una clínica sin ningún administrador activo se queda sin quien la gestione.
  if (usuario.activo && usuario.rol === 'admin') {
    const otrosAdmins = db
      .get('usuarios')
      .filter((u) => u.clinica_id === usuario.clinica_id && u.rol === 'admin' && u.activo && u.id !== usuarioId)
    if (otrosAdmins.length === 0) {
      throw new Error('Es el único administrador activo de la clínica: nombra otro antes de desactivarlo')
    }
  }

  db.set(
    'usuarios',
    db.get('usuarios').map((u) => (u.id === usuarioId ? { ...u, activo: !u.activo } : u)),
  )
  return delay(undefined)
}
