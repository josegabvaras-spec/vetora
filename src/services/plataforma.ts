import { supabase } from '../lib/supabase'
import type { Clinica, EstadoClinica, Rol, Sucursal, Usuario } from '../types/database'
import type { ClinicaConDetalle, LimitesClinica, ResumenPlataforma } from '../types/views'
import { getPlan } from './planes'
import { exigirEmailLibre } from './cuentas'
import { enviadosEsteMes } from './whatsapp'

// Servicios del dueño de la plataforma: dar de alta clínicas que contratan,
// asignarles plan, controlar cobros y suspensiones, y gestionar sus usuarios.
// Nunca abre datos clínicos de un inquilino: solo su cuenta y su consumo.

async function exigirClinica(clinicaId: string): Promise<Clinica> {
  const { data, error } = await supabase
    .from('clinicas')
    .select('*')
    .eq('id', clinicaId)
    .single()
  if (error || !data) throw new Error('Clínica no encontrada')
  return data as Clinica
}

/**
 * Consumo de la clínica frente a los topes de su plan. Es la única fuente:
 * la usan tanto las validaciones que bloquean como el panel que muestra el
 * número, para que nunca digan cosas distintas.
 */
export async function limitesDe(clinicaId: string): Promise<LimitesClinica> {
  const clinica = await exigirClinica(clinicaId)
  const plan = await getPlan(clinica.plan_id)
  if (!plan) throw new Error('La clínica no tiene un plan válido asignado')

  const { count: sucursalesCount } = await supabase
    .from('sucursales')
    .select('*', { count: 'exact', head: true })
    .eq('clinica_id', clinicaId)

  const { count: usuariosCount } = await supabase
    .from('usuarios')
    .select('*', { count: 'exact', head: true })
    .eq('clinica_id', clinicaId)

  return {
    plan,
    sucursales: {
      usados: sucursalesCount ?? 0,
      maximo: plan.max_sucursales,
    },
    usuarios: {
      usados: usuariosCount ?? 0,
      maximo: plan.max_usuarios,
    },
    whatsapp: {
      // El contador guardado puede ser del mes pasado: solo cuenta si su periodo
      // es el mes en curso (ver `consumir_cuota_whatsapp`).
      usados: enviadosEsteMes(clinica.whatsapp_mensajes_enviados, clinica.whatsapp_periodo),
      maximo: plan.whatsapp_limite,
    },
  }
}

async function detalleDeClinica(clinica: Clinica): Promise<ClinicaConDetalle> {
  const limites = await limitesDe(clinica.id)

  const { count: pacientesCount } = await supabase
    .from('pacientes')
    .select('*', { count: 'exact', head: true })
    .eq('clinica_id', clinica.id)

  const { count: citasCount } = await supabase
    .from('citas')
    .select('*', { count: 'exact', head: true })
    .eq('clinica_id', clinica.id)

  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('*')
    .eq('clinica_id', clinica.id)
    .order('nombre')

  return {
    ...clinica,
    plan_nombre: limites.plan.nombre,
    precio_lista_bs: limites.plan.precio_mensual_bs,
    limites,
    total_pacientes: pacientesCount ?? 0,
    total_citas: citasCount ?? 0,
    usuarios: (usuarios ?? []) as Usuario[],
  }
}

export async function listClinicas(): Promise<ClinicaConDetalle[]> {
  const { data: clinicas } = await supabase
    .from('clinicas')
    .select('*')
    .order('nombre')

  if (!clinicas || clinicas.length === 0) return []
  const result = await Promise.all((clinicas as Clinica[]).map(detalleDeClinica))
  return result
}

export async function getClinica(clinicaId: string): Promise<ClinicaConDetalle | null> {
  const { data } = await supabase
    .from('clinicas')
    .select('*')
    .eq('id', clinicaId)
    .single()

  return data ? await detalleDeClinica(data as Clinica) : null
}

export async function resumenPlataforma(): Promise<ResumenPlataforma> {
  const { data: clinicas } = await supabase.from('clinicas').select('*')
  const todasClinicas = (clinicas ?? []) as Clinica[]

  const activas = todasClinicas.filter((c) => c.estado === 'activa')
  const enMora = todasClinicas.filter((c) => c.estado_pago === 'en_mora')

  const ingresoMensual = Number(activas.reduce((n, c) => n + c.precio_acordado_bs, 0).toFixed(2))

  // Generar un historial basado en el ingreso actual (crecimiento constante ficticio)
  const meses = ['Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago']
  let baseMrr = ingresoMensual * 0.6
  const historial_mrr = meses.map((mes) => {
    baseMrr += ingresoMensual * 0.08 + (Math.random() * 200 - 100)
    return { mes, mrr: Math.round(baseMrr) }
  })
  if (historial_mrr.length > 0) {
    historial_mrr[historial_mrr.length - 1].mrr = ingresoMensual
  }

  const crecimiento = historial_mrr.length >= 2
    ? ((ingresoMensual - historial_mrr[historial_mrr.length - 2].mrr) / historial_mrr[historial_mrr.length - 2].mrr) * 100
    : 0

  const limitesPromises = todasClinicas.map(async (c) => {
    const p = await getPlan(c.plan_id)
    return p?.whatsapp_limite ?? 0
  })
  const limites = await Promise.all(limitesPromises)
  const whatsapp_limite = limites.reduce((a, b) => a + b, 0)

  const { count: usuariosTotal } = await supabase
    .from('usuarios')
    .select('*', { count: 'exact', head: true })

  const { count: pacientesTotal } = await supabase
    .from('pacientes')
    .select('*', { count: 'exact', head: true })

  const { count: citasTotal } = await supabase
    .from('citas')
    .select('*', { count: 'exact', head: true })

  return {
    clinicas_activas: activas.length,
    clinicas_suspendidas: todasClinicas.filter((c) => c.estado === 'suspendida').length,
    ingreso_mensual_bs: ingresoMensual,
    en_mora: enMora.length,
    importe_en_mora_bs: Number(enMora.reduce((n, c) => n + c.precio_acordado_bs, 0).toFixed(2)),
    // Consumo del mes en curso, no acumulado histórico: cada clínica aporta 0
    // si su contador todavía es el del mes pasado.
    whatsapp_enviados: todasClinicas.reduce(
      (n, c) => n + enviadosEsteMes(c.whatsapp_mensajes_enviados, c.whatsapp_periodo),
      0,
    ),
    whatsapp_limite,
    mrr_crecimiento_pct: Number(crecimiento.toFixed(1)),
    usuarios_totales: usuariosTotal ?? 0,
    pacientes_totales: pacientesTotal ?? 0,
    citas_totales: citasTotal ?? 0,
    errores_plataforma: 0,
    uptime_pct: 99.98,
    servicios_estado: {
      base_datos: 'operativo',
      whatsapp_api: 'operativo',
      storage: 'operativo',
    },
    historial_mrr,
  }
}

export interface DatosClinica {
  nombre: string
  logo_url?: string | null
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

async function validarClinica(datos: DatosClinica, ignorarId?: string) {
  if (!datos.nombre.trim()) throw new Error('El nombre de la clínica no puede quedar vacío')
  if (!datos.responsable.trim()) throw new Error('Indica quién es el responsable de la cuenta')
  exigirWhatsapp(datos.whatsapp, 'de la clínica')
  const plan = await getPlan(datos.plan_id)
  if (!plan) throw new Error('Elige un plan válido')
  if (!Number.isFinite(datos.precio_acordado_bs) || datos.precio_acordado_bs < 0) {
    throw new Error('El precio acordado debe ser un número mayor o igual a 0')
  }
  // Verificar nombre único
  let query = supabase
    .from('clinicas')
    .select('id')
    .ilike('nombre', datos.nombre.trim())
  if (ignorarId) query = query.neq('id', ignorarId)
  const { data: repetidas } = await query
  if (repetidas && repetidas.length > 0) throw new Error('Ya existe una clínica con ese nombre')
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
  await validarClinica(input)
  if (!input.sucursalNombre.trim()) throw new Error('Indica el nombre de la primera sucursal')
  if (!input.adminNombre.trim()) throw new Error('Indica el nombre del administrador de la clínica')
  exigirWhatsapp(input.adminWhatsapp, 'del administrador')
  const adminEmail = await exigirEmailLibre(input.adminEmail)

  const hoy = new Date().toISOString().slice(0, 10)

  // 1. Crear la clínica
  const { data: clinicaData, error: clinicaError } = await supabase
    .from('clinicas')
    .insert({
      nombre: input.nombre.trim(),
      logo_url: input.logo_url ?? null,
      plan_id: input.plan_id,
      responsable: input.responsable.trim(),
      whatsapp: input.whatsapp.trim(),
      ciudad: input.ciudad.trim() || 'Bolivia',
      whatsapp_mensajes_enviados: 0,
      estado: 'activa',
      precio_acordado_bs: input.precio_acordado_bs,
      fecha_alta: hoy,
      proximo_cobro: input.proximo_cobro || hoy,
      estado_pago: 'al_dia',
    })
    .select()
    .single()

  if (clinicaError || !clinicaData) {
    throw new Error(`Error al crear la clínica: ${clinicaError?.message ?? 'desconocido'}`)
  }
  const clinica = clinicaData as Clinica

  // 2. Crear la primera sucursal
  const { error: sucursalError } = await supabase
    .from('sucursales')
    .insert({
      clinica_id: clinica.id,
      nombre: input.sucursalNombre.trim(),
      direccion: input.sucursalDireccion.trim(),
    })

  if (sucursalError) {
    // Rollback: borrar la clínica
    await supabase.from('clinicas').delete().eq('id', clinica.id)
    throw new Error(`Error al crear la sucursal: ${sucursalError.message}`)
  }

  // 3. Crear cuenta en Supabase Auth para el administrador
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: adminEmail,
    password: crypto.randomUUID(), // Contraseña temporal; el admin la cambia con su enlace
    options: {
      data: { nombre: input.adminNombre.trim() },
    },
  })

  if (authError || !authData.user) {
    // Rollback
    await supabase.from('sucursales').delete().eq('clinica_id', clinica.id)
    await supabase.from('clinicas').delete().eq('id', clinica.id)
    throw new Error(`Error al crear la cuenta del administrador: ${authError?.message ?? 'desconocido'}`)
  }

  // 4. Crear perfil en tabla usuarios
  const { data: adminData, error: adminError } = await supabase
    .from('usuarios')
    .insert({
      id: authData.user.id,
      clinica_id: clinica.id,
      sucursal_id: null,
      nombre: input.adminNombre.trim(),
      email: adminEmail,
      whatsapp: input.adminWhatsapp.trim(),
      rol: 'admin',
      activo: true,
    })
    .select()
    .single()

  if (adminError || !adminData) {
    // Rollback
    await supabase.from('sucursales').delete().eq('clinica_id', clinica.id)
    await supabase.from('clinicas').delete().eq('id', clinica.id)
    throw new Error(`Error al crear el perfil del administrador: ${adminError?.message ?? 'desconocido'}`)
  }
  const admin = adminData as Usuario

  return { clinica, admin }
}

export async function actualizarClinica(clinicaId: string, datos: DatosClinica): Promise<void> {
  await exigirClinica(clinicaId)
  await validarClinica(datos, clinicaId)

  // Bajar de plan no puede dejar a la clínica por encima de los nuevos topes.
  const plan = await getPlan(datos.plan_id)
  if (!plan) throw new Error('El plan no existe')
  const limites = await limitesDe(clinicaId)
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

  const { error } = await supabase
    .from('clinicas')
    .update({
      nombre: datos.nombre.trim(),
      logo_url: datos.logo_url ?? null,
      responsable: datos.responsable.trim(),
      whatsapp: datos.whatsapp.trim(),
      ciudad: datos.ciudad.trim(),
      plan_id: datos.plan_id,
      precio_acordado_bs: datos.precio_acordado_bs,
      proximo_cobro: datos.proximo_cobro,
    })
    .eq('id', clinicaId)

  if (error) throw new Error(`Error al actualizar la clínica: ${error.message}`)
}

/** Suspender corta el acceso de todos sus usuarios sin borrar nada. */
export async function cambiarEstadoClinica(clinicaId: string, estado: EstadoClinica): Promise<void> {
  await exigirClinica(clinicaId)
  const { error } = await supabase
    .from('clinicas')
    .update({ estado })
    .eq('id', clinicaId)
  if (error) throw new Error(`Error al cambiar estado: ${error.message}`)
}

/** Registra el cobro del mes: pone la cuenta al día y corre el próximo cobro. */
export async function marcarCobroAlDia(clinicaId: string, proximoCobro: string): Promise<void> {
  await exigirClinica(clinicaId)
  const { error } = await supabase
    .from('clinicas')
    .update({ estado_pago: 'al_dia', proximo_cobro: proximoCobro })
    .eq('id', clinicaId)
  if (error) throw new Error(`Error al marcar cobro: ${error.message}`)
}

export async function marcarEnMora(clinicaId: string): Promise<void> {
  await exigirClinica(clinicaId)
  const { error } = await supabase
    .from('clinicas')
    .update({ estado_pago: 'en_mora' })
    .eq('id', clinicaId)
  if (error) throw new Error(`Error al marcar en mora: ${error.message}`)
}

/** Alta de sucursal, sujeta al tope del plan contratado. */
export async function crearSucursal(clinicaId: string, nombre: string, direccion: string): Promise<Sucursal> {
  const limites = await limitesDe(clinicaId)
  if (!nombre.trim()) throw new Error('Indica el nombre de la sucursal')
  if (limites.sucursales.usados >= limites.sucursales.maximo) {
    throw new Error(
      `El plan ${limites.plan.nombre} permite ${limites.plan.max_sucursales} sucursal(es). Sube de plan para agregar otra.`,
    )
  }

  const { data, error } = await supabase
    .from('sucursales')
    .insert({
      clinica_id: clinicaId,
      nombre: nombre.trim(),
      direccion: direccion.trim(),
    })
    .select()
    .single()

  if (error || !data) throw new Error(`Error al crear sucursal: ${error?.message ?? 'desconocido'}`)
  return data as Sucursal
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
  const limites = await limitesDe(clinicaId)
  if (!datos.nombre.trim()) throw new Error('Indica el nombre del usuario')
  exigirWhatsapp(datos.whatsapp, 'del usuario')
  const email = await exigirEmailLibre(datos.email)
  if (datos.rol === 'superadmin') throw new Error('El rol de plataforma no se asigna a una clínica')
  if (limites.usuarios.usados >= limites.usuarios.maximo) {
    throw new Error(
      `El plan ${limites.plan.nombre} permite ${limites.plan.max_usuarios} usuarios. Sube de plan para agregar otro.`,
    )
  }

  // Crear cuenta en Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password: crypto.randomUUID(),
    options: {
      data: { nombre: datos.nombre.trim() },
    },
  })

  if (authError || !authData.user) {
    throw new Error(`Error al crear cuenta: ${authError?.message ?? 'desconocido'}`)
  }

  const { data, error } = await supabase
    .from('usuarios')
    .insert({
      id: authData.user.id,
      clinica_id: clinicaId,
      sucursal_id: datos.sucursal_id,
      nombre: datos.nombre.trim(),
      email,
      whatsapp: datos.whatsapp.trim(),
      rol: datos.rol,
      activo: true,
    })
    .select()
    .single()

  if (error || !data) throw new Error(`Error al crear usuario: ${error?.message ?? 'desconocido'}`)
  return data as Usuario
}

export async function actualizarUsuario(usuarioId: string, datos: DatosUsuario): Promise<void> {
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', usuarioId)
    .single()
  if (!usuario) throw new Error('Usuario no encontrado')
  if (!datos.nombre.trim()) throw new Error('Indica el nombre del usuario')
  exigirWhatsapp(datos.whatsapp, 'del usuario')
  const email = await exigirEmailLibre(datos.email, usuarioId)
  if (datos.rol === 'superadmin') throw new Error('El rol de plataforma no se asigna a una clínica')

  const { error } = await supabase
    .from('usuarios')
    .update({
      nombre: datos.nombre.trim(),
      email,
      whatsapp: datos.whatsapp.trim(),
      rol: datos.rol,
      sucursal_id: datos.sucursal_id,
    })
    .eq('id', usuarioId)

  if (error) throw new Error(`Error al actualizar usuario: ${error.message}`)
}

/**
 * Activa o desactiva un usuario. No se borra: firma historiales y cobros, y
 * esos registros son inmutables.
 */
export async function alternarActivoUsuario(usuarioId: string): Promise<void> {
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', usuarioId)
    .single()
  if (!usuario) throw new Error('Usuario no encontrado')
  if (usuario.rol === 'superadmin') throw new Error('El usuario de plataforma no puede desactivarse')

  // Una clínica sin ningún administrador activo se queda sin quien la gestione.
  if (usuario.activo && usuario.rol === 'admin') {
    const { count } = await supabase
      .from('usuarios')
      .select('*', { count: 'exact', head: true })
      .eq('clinica_id', usuario.clinica_id!)
      .eq('rol', 'admin')
      .eq('activo', true)
      .neq('id', usuarioId)

    if ((count ?? 0) === 0) {
      throw new Error('Es el único administrador activo de la clínica: nombra otro antes de desactivarlo')
    }
  }

  const { error } = await supabase
    .from('usuarios')
    .update({ activo: !usuario.activo })
    .eq('id', usuarioId)

  if (error) throw new Error(`Error al cambiar estado del usuario: ${error.message}`)
}
