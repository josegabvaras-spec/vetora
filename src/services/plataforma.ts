import { motivoDelFallo, supabase } from '../lib/supabase'
import { clinicDayIso, clinicMonth, desdeFechaSola, sumarMeses } from '../lib/datetime'
import type { Clinica, EstadoClinica, Rol, Sucursal, Usuario } from '../types/database'
import type { ClinicaConDetalle, LimitesClinica, ResumenPlataforma } from '../types/views'
import { getPlan } from './planes'
import { exigirEmailLibre } from './cuentas'
import { enviadosEsteMes } from './whatsapp'

// Servicios del dueño de la plataforma: dar de alta clínicas que contratan,
// asignarles plan, controlar cobros y suspensiones, y gestionar sus usuarios.
// Nunca abre datos clínicos de un inquilino: solo su cuenta y su consumo.

/**
 * Lanza si el UPDATE no tocó ninguna fila.
 *
 * PostgREST **no da error** cuando la RLS filtra la fila: devuelve 204 con
 * `error: null`. Todas las policies de este archivo exigen superadmin
 * (`clinicas_plataforma`, `usuarios_plataforma`), así que sin esta comprobación
 * suspender una clínica o marcar un cobro al día informaba "hecho" sin haber
 * cambiado nada en la base.
 */
function exigirFilaAfectada(filas: unknown[] | null, accion: string): void {
  if (!filas || filas.length === 0) {
    throw new Error(`No se pudo ${accion}: no tienes permiso o el registro ya no existe`)
  }
}

/**
 * Crea la cuenta de Supabase Auth del personal, en la Edge Function
 * `crear-cuenta` (`service_role`).
 *
 * Aquí vivía una versión que llamaba a `supabase.auth.signUp` desde el
 * navegador y hacía malabares para no perder la sesión del superadmin. No
 * sobrevive a tener «Confirm email» activado en Auth: `signUp` manda entonces
 * un correo de confirmación que aquí sobra (el acceso llega por WhatsApp) y,
 * peor, **oculta que el correo ya existe** devolviendo un usuario falso con un
 * uuid inventado —protección contra enumeración—, que al insertarse en
 * `usuarios.id` (FK a `auth.users`) reventaba con un 23503 incomprensible con
 * la clínica ya creada.
 *
 * `admin.createUser` no obfusca, no manda correo y no toca la sesión de quien
 * llama, así que el problema de la sesión desaparece de raíz en vez de
 * remendarse. El motivo del rechazo va en el cuerpo de la respuesta.
 */
async function crearCuentaAuth(
  email: string,
  nombre: string,
): Promise<{ userId: string | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke<{ user_id?: string }>('crear-cuenta', {
    body: { accion: 'crear', email, nombre },
  })

  if (error) {
    return { userId: null, error: (await motivoDelFallo(error)) ?? error.message }
  }
  if (!data?.user_id) return { userId: null, error: 'desconocido' }
  return { userId: data.user_id, error: null }
}

/**
 * Deshace la cuenta de Auth cuando el perfil no llegó a crearse.
 *
 * Sin esto el correo quedaba quemado para siempre: `exigirEmailLibre` solo mira
 * la tabla `usuarios`, así que seguía diciendo que estaba libre y cada reintento
 * moría con "User already registered". La función solo borra cuentas sin perfil,
 * de modo que un fallo aquí no puede llevarse por delante a nadie real.
 */
async function deshacerCuentaAuth(userId: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean }>('crear-cuenta', {
    body: { accion: 'borrar', user_id: userId },
  })
  return !error && data?.ok === true
}

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

  // Las cuentas del portal (`rol = 'cliente'`) viven en `usuarios` con la
  // clinica_id de su veterinaria, pero NO son personal y no ocupan plaza del
  // plan. Sin excluirlas, dos dueños registrándose en el portal impedían dar de
  // alta al siguiente empleado y bloqueaban el cambio de plan.
  const { count: usuariosCount } = await supabase
    .from('usuarios')
    .select('*', { count: 'exact', head: true })
    .eq('clinica_id', clinicaId)
    .neq('rol', 'cliente')

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

  // MRR histórico reconstruido desde `clinicas.fecha_alta`: para cada mes se
  // suma el precio acordado de las clínicas que ya estaban dadas de alta.
  //
  // Antes esto se fabricaba con `Math.random()` sobre el ingreso actual, así que
  // el panel enseñaba una curva distinta en cada recarga y el porcentaje de
  // crecimiento se calculaba dividiendo por ese ruido. Un dato de negocio
  // inventado es peor que no tener el dato.
  //
  // Limitación honesta: no hay tabla de cobros de suscripción, así que esto
  // aproxima con el precio y el estado de HOY (no sabe de cambios de plan ni de
  // suspensiones pasadas). Es una reconstrucción, pero cada punto sale de una
  // fila real y es estable entre recargas.
  const nombresMeses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const mesActual = clinicMonth(new Date().toISOString())

  const historial_mrr = Array.from({ length: 6 }, (_, i) => {
    const mes = sumarMeses(mesActual, i - 5)
    const mrr = todasClinicas
      .filter((c) => c.estado === 'activa' && clinicMonth(desdeFechaSola(c.fecha_alta)) <= mes)
      .reduce((n, c) => n + c.precio_acordado_bs, 0)

    const [anio, numeroMes] = mes.split('-').map(Number)
    return {
      mes: `${nombresMeses[numeroMes - 1]} ${String(anio).slice(2)}`,
      mrr: Number(mrr.toFixed(2)),
    }
  })

  const mrrMesAnterior = historial_mrr[historial_mrr.length - 2]?.mrr ?? 0
  // Sin este guard, una plataforma nueva (o con todo suspendido) dividía entre
  // cero y el panel imprimía "Infinity%".
  const crecimiento =
    mrrMesAnterior > 0 ? ((ingresoMensual - mrrMesAnterior) / mrrMesAnterior) * 100 : 0

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

  // Día de la clínica: con `toISOString()` una alta hecha después de las 20:00
  // en Bolivia quedaba fechada mañana, y con ella el próximo cobro.
  const hoy = clinicDayIso()

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
  const { userId, error: authError } = await crearCuentaAuth(
    adminEmail,
    input.adminNombre.trim(),
  )

  if (authError || !userId) {
    // Rollback: ahora sí corre con la sesión del superadmin, así que borra de verdad.
    await supabase.from('sucursales').delete().eq('clinica_id', clinica.id)
    await supabase.from('clinicas').delete().eq('id', clinica.id)
    throw new Error(`Error al crear la cuenta del administrador: ${authError ?? 'desconocido'}`)
  }

  // 4. Crear perfil en tabla usuarios
  const { data: adminData, error: adminError } = await supabase
    .from('usuarios')
    .insert({
      id: userId,
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
    // Rollback completo: también la cuenta de Auth, que si no dejaría el correo
    // inutilizable para volver a intentar el alta.
    await deshacerCuentaAuth(userId)
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

  const { data, error } = await supabase
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
    .select('id')

  if (error) throw new Error(`Error al actualizar la clínica: ${error.message}`)
  exigirFilaAfectada(data, 'actualizar la clínica')
}

/** Suspender corta el acceso de todos sus usuarios sin borrar nada. */
export async function cambiarEstadoClinica(clinicaId: string, estado: EstadoClinica): Promise<void> {
  await exigirClinica(clinicaId)
  const { data, error } = await supabase
    .from('clinicas')
    .update({ estado })
    .eq('id', clinicaId)
    .select('id')
  if (error) throw new Error(`Error al cambiar estado: ${error.message}`)
  exigirFilaAfectada(data, 'cambiar el estado de la clínica')
}

/** Registra el cobro del mes: pone la cuenta al día y corre el próximo cobro. */
export async function marcarCobroAlDia(clinicaId: string, proximoCobro: string): Promise<void> {
  await exigirClinica(clinicaId)
  const { data, error } = await supabase
    .from('clinicas')
    .update({ estado_pago: 'al_dia', proximo_cobro: proximoCobro })
    .eq('id', clinicaId)
    .select('id')
  if (error) throw new Error(`Error al marcar cobro: ${error.message}`)
  exigirFilaAfectada(data, 'registrar el cobro')
}

export async function marcarEnMora(clinicaId: string): Promise<void> {
  await exigirClinica(clinicaId)
  const { data, error } = await supabase
    .from('clinicas')
    .update({ estado_pago: 'en_mora' })
    .eq('id', clinicaId)
    .select('id')
  if (error) throw new Error(`Error al marcar en mora: ${error.message}`)
  exigirFilaAfectada(data, 'marcar en mora')
}

/**
 * Pone a cero el consumo de WhatsApp del mes en curso.
 *
 * Existe porque el contador puede quedar inflado sin que nadie haya enviado
 * nada —así lo dejó un script de pruebas ejecutado contra producción—, y hasta
 * ahora la única salida era un UPDATE a mano en el editor SQL.
 *
 * Solo la plataforma: `clinicas_plataforma` es la única policy de UPDATE sobre
 * `clinicas`. Dársela al admin de la clínica le permitiría cambiarse `plan_id`
 * y `precio_acordado_bs`, que es justo lo que `consumir_cuota_whatsapp()` evita
 * siendo `security definer`.
 *
 * El periodo se pone al mes en curso: dejarlo en uno viejo haría que el primer
 * envío lo interpretara como mes nuevo y volviera a 1 en vez de a 0, con lo que
 * el reinicio se comería un mensaje.
 */
export async function reiniciarCuotaWhatsapp(clinicaId: string): Promise<void> {
  await exigirClinica(clinicaId)
  const { data, error } = await supabase
    .from('clinicas')
    .update({
      whatsapp_mensajes_enviados: 0,
      whatsapp_periodo: `${clinicMonth(new Date().toISOString())}-01`,
    })
    .eq('id', clinicaId)
    .select('id')
  if (error) throw new Error(`Error al reiniciar la cuota: ${error.message}`)
  exigirFilaAfectada(data, 'reiniciar la cuota de WhatsApp')
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

  const { userId, error: authError } = await crearCuentaAuth(email, datos.nombre.trim())

  if (authError || !userId) {
    throw new Error(`Error al crear cuenta: ${authError ?? 'desconocido'}`)
  }

  const { data, error } = await supabase
    .from('usuarios')
    .insert({
      id: userId,
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

  if (error || !data) {
    // La cuenta de Auth quedó sin perfil: se deshace para que el correo siga
    // sirviendo. Antes no se podía (`auth.admin` exige `service_role`) y el
    // aviso solo sabía decir "ese correo ya no se puede reutilizar".
    const deshecha = await deshacerCuentaAuth(userId)
    throw new Error(
      `No se pudo crear el perfil de ${email}: ${error?.message ?? 'desconocido'}.` +
        (deshecha
          ? ' Puedes volver a intentarlo con el mismo correo.'
          : ' Además quedó una cuenta de acceso suelta: bórrala desde el panel de Supabase (Authentication → Users) antes de reintentar.'),
    )
  }
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

  const { data, error } = await supabase
    .from('usuarios')
    .update({
      nombre: datos.nombre.trim(),
      email,
      whatsapp: datos.whatsapp.trim(),
      rol: datos.rol,
      sucursal_id: datos.sucursal_id,
    })
    .eq('id', usuarioId)
    .select('id')

  if (error) throw new Error(`Error al actualizar usuario: ${error.message}`)
  exigirFilaAfectada(data, 'actualizar el usuario')
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

  const { data, error } = await supabase
    .from('usuarios')
    .update({ activo: !usuario.activo })
    .eq('id', usuarioId)
    .select('id')

  if (error) throw new Error(`Error al cambiar estado del usuario: ${error.message}`)
  exigirFilaAfectada(data, 'cambiar el estado del usuario')
}
