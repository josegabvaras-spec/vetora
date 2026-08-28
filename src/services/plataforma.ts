import { motivoDelFallo, supabase } from '../lib/supabase'
import { clinicDayIso, clinicMonth, desdeFechaSola, sumarMeses } from '../lib/datetime'
import type { Clinica, EstadoClinica, PagoSuscripcion, Rol, Sucursal, TipoNegocio, Usuario } from '../types/database'
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

  // Se traen todas y se separan aquí, en DOS campos distintos.
  //
  // El personal y las cuentas del portal (`rol = 'cliente'`, dueños de
  // mascota) no se mezclan: solo el personal ocupa plaza del plan —igual que
  // en `limitesDe`— y solo el personal tiene un rol válido en el desplegable
  // de edición. Mezclarlos hacía que el contador de la cabecera no cuadrara
  // con las filas y que al editar un dueño su rol cayera en «Administrador».
  //
  // Pero tampoco se descartan: el superadmin necesita poder ver que alguien
  // se registró en el portal, que era el otro lado del mismo problema.
  const { data: todos } = await supabase
    .from('usuarios')
    .select('*')
    .eq('clinica_id', clinica.id)
    .order('nombre')

  const filas = (todos ?? []) as Usuario[]

  return {
    ...clinica,
    plan_nombre: limites.plan.nombre,
    precio_lista_usd: limites.plan.precio_mensual_usd,
    limites,
    total_pacientes: pacientesCount ?? 0,
    total_citas: citasCount ?? 0,
    usuarios: filas.filter((u) => u.rol !== 'cliente'),
    usuarios_portal: filas.filter((u) => u.rol === 'cliente'),
  }
}

/**
 * Todas las clínicas con su detalle, en **cinco consultas** en vez de seis por
 * clínica.
 *
 * `detalleDeClinica` está pensado para UNA: hace `limitesDe` (que a su vez son
 * `getPlan` más dos `count`) y dos `count` más. Esta es la pantalla principal
 * del dueño de la plataforma y la única cuyo coste crece con el número de
 * clientes del SaaS: con 50 clínicas eran unas 300 peticiones al abrirla.
 *
 * Los `count` por clínica pasan a ser un recuento en memoria sobre los ids ya
 * traídos. Solo se piden las columnas que hacen falta para contar, salvo
 * `usuarios`, que va entero porque el modal de detalle recibe esta misma fila y
 * pinta la lista.
 *
 * `getClinica` sigue usando `detalleDeClinica`: para una sola fila, montar los
 * mapas no compensa.
 */
export async function listClinicas(): Promise<ClinicaConDetalle[]> {
  const { data: clinicas } = await supabase
    .from('clinicas')
    .select('*')
    .order('nombre')

  if (!clinicas || clinicas.length === 0) return []
  const filas = clinicas as Clinica[]

  const [{ data: planes }, { data: sucursales }, { data: usuarios }, { data: pacientes }, { data: citas }] =
    await Promise.all([
      supabase.from('planes').select('*').in('id', [...new Set(filas.map((c) => c.plan_id))]),
      supabase.from('sucursales').select('clinica_id'),
      // Todas, y se separan abajo en personal y cuentas del portal — igual
      // que en `detalleDeClinica`, que es su versión para una sola clínica.
      supabase.from('usuarios').select('*').order('nombre'),
      supabase.from('pacientes').select('clinica_id'),
      supabase.from('citas').select('clinica_id'),
    ])

  const contarPor = (filasTabla: { clinica_id: string | null }[] | null): Map<string, number> => {
    const mapa = new Map<string, number>()
    for (const f of filasTabla ?? []) {
      if (!f.clinica_id) continue
      mapa.set(f.clinica_id, (mapa.get(f.clinica_id) ?? 0) + 1)
    }
    return mapa
  }

  const mapaPlanes = new Map((planes ?? []).map((x: any) => [x.id, x]))
  const porSucursales = contarPor(sucursales as any[])

  // Personal y cuentas del portal, separados: solo el personal ocupa plaza del
  // plan (igual que en `limitesDe`) y solo el personal se edita con el
  // desplegable de roles. Ver el comentario largo en `detalleDeClinica`.
  const personal = ((usuarios ?? []) as Usuario[]).filter((u) => u.rol !== 'cliente')
  const delPortal = ((usuarios ?? []) as Usuario[]).filter((u) => u.rol === 'cliente')

  const porUsuarios = contarPor(personal as any[])
  const porPacientes = contarPor(pacientes as any[])
  const porCitas = contarPor(citas as any[])

  const agruparPorClinica = (lista: Usuario[]): Map<string, Usuario[]> => {
    const mapa = new Map<string, Usuario[]>()
    for (const u of lista) {
      if (!u.clinica_id) continue
      const acumulado = mapa.get(u.clinica_id) ?? []
      acumulado.push(u)
      mapa.set(u.clinica_id, acumulado)
    }
    return mapa
  }
  const usuariosPorClinica = agruparPorClinica(personal)
  const portalPorClinica = agruparPorClinica(delPortal)

  return filas.map((clinica) => {
    const plan = mapaPlanes.get(clinica.plan_id)
    if (!plan) throw new Error(`La clínica ${clinica.nombre} no tiene un plan válido asignado`)

    const limites: LimitesClinica = {
      plan,
      sucursales: { usados: porSucursales.get(clinica.id) ?? 0, maximo: plan.max_sucursales },
      usuarios: { usados: porUsuarios.get(clinica.id) ?? 0, maximo: plan.max_usuarios },
      whatsapp: {
        // El contador guardado puede ser del mes pasado; ver `consumir_cuota_whatsapp`.
        usados: enviadosEsteMes(clinica.whatsapp_mensajes_enviados, clinica.whatsapp_periodo),
        maximo: plan.whatsapp_limite,
      },
    }

    return {
      ...clinica,
      plan_nombre: plan.nombre,
      precio_lista_usd: plan.precio_mensual_usd,
      limites,
      total_pacientes: porPacientes.get(clinica.id) ?? 0,
      total_citas: porCitas.get(clinica.id) ?? 0,
      usuarios: usuariosPorClinica.get(clinica.id) ?? [],
      usuarios_portal: portalPorClinica.get(clinica.id) ?? [],
    } as ClinicaConDetalle
  })
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

  const ingresoMensual = Number(activas.reduce((n, c) => n + c.precio_acordado_usd, 0).toFixed(2))

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
      .reduce((n, c) => n + c.precio_acordado_usd, 0)

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
    ingreso_mensual_usd: ingresoMensual,
    en_mora: enMora.length,
    importe_en_mora_usd: Number(enMora.reduce((n, c) => n + c.precio_acordado_usd, 0).toFixed(2)),
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
  precio_acordado_usd: number
  proximo_cobro: string
  /**
   * Segmento de negocio del establecimiento (migración 0023).
   * Determina qué módulos se muestran y qué flujo es el principal del sistema.
   */
  tipo_negocio: TipoNegocio
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
  if (!Number.isFinite(datos.precio_acordado_usd) || datos.precio_acordado_usd < 0) {
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
      precio_acordado_usd: input.precio_acordado_usd,
      fecha_alta: hoy,
      proximo_cobro: input.proximo_cobro || hoy,
      estado_pago: 'al_dia',
      tipo_negocio: input.tipo_negocio ?? 'veterinaria',
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
      precio_acordado_usd: datos.precio_acordado_usd,
      proximo_cobro: datos.proximo_cobro,
      // Se persiste para poder CORREGIRLO: una clínica dada de alta como
      // veterinaria por error tiene que poder pasar a peluquería sin recrearla.
      // El modal ya lo enviaba, pero este update lo ignoraba.
      tipo_negocio: datos.tipo_negocio,
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

export interface ResultadoBorrado {
  cuentasBorradas: number
  cuentasFallidas: number
}

/**
 * Borra una clínica por completo: sus datos clínicos y de negocio (por
 * cascada de FK), los archivos que tuviera en Storage, y las cuentas de Auth
 * de su personal. A diferencia de `cambiarEstadoClinica`, **no hay vuelta
 * atrás**.
 *
 * Pasa por la Edge Function `eliminar-clinica` porque limpiar `auth.users` y
 * los buckets privados de otra clínica exige `service_role`, que el
 * navegador nunca tiene — el superadmin no puede hacerlo con su propia sesión.
 */
export async function borrarClinica(clinicaId: string): Promise<ResultadoBorrado> {
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean
    cuentas_borradas?: number
    cuentas_fallidas?: number
    error?: string
  }>('eliminar-clinica', { body: { clinica_id: clinicaId } })

  if (error) throw new Error((await motivoDelFallo(error)) ?? 'No se pudo borrar la clínica')
  if (!data || data.error) throw new Error(data?.error ?? 'No se pudo borrar la clínica')

  return {
    cuentasBorradas: data.cuentas_borradas ?? 0,
    cuentasFallidas: data.cuentas_fallidas ?? 0,
  }
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
 * y `precio_acordado_usd`, que es justo lo que `consumir_cuota_whatsapp()` evita
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

/**
 * Antes de desactivar a un admin o quitarle el rol, comprueba que la clínica
 * no se quede sin nadie que pueda gestionarla. Compartido por
 * `alternarActivoUsuario` (al desactivar) y `actualizarUsuario` (al degradar
 * el rol de un admin activo) — mismo criterio, misma consulta.
 */
async function exigirOtroAdminActivo(usuario: Usuario, accion: string): Promise<void> {
  const { count } = await supabase
    .from('usuarios')
    .select('*', { count: 'exact', head: true })
    .eq('clinica_id', usuario.clinica_id!)
    .eq('rol', 'admin')
    .eq('activo', true)
    .neq('id', usuario.id)

  if ((count ?? 0) === 0) {
    throw new Error(`Es el único administrador activo de la clínica: nombra otro antes de ${accion}`)
  }
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

  // Una cuenta del portal no se gestiona desde el panel de personal, ni en un
  // sentido ni en el otro. Sin esto, ascender a un dueño de mascota a `admin`
  // le daba acceso completo al sistema clínico — y era fácil hacerlo sin
  // querer, porque su rol no existe en el desplegable y este pintaba
  // «Administrador» por defecto.
  if (usuario.rol === 'cliente') {
    throw new Error('Es una cuenta del portal de dueños: se gestiona desde la ficha de su mascota, no desde aquí')
  }
  if (datos.rol === 'cliente') throw new Error('El rol del portal no se asigna al personal de la clínica')

  // Degradar al único admin activo lo deja igual de sin gestión que desactivarlo.
  if (usuario.activo && usuario.rol === 'admin' && datos.rol !== 'admin') {
    await exigirOtroAdminActivo(usuario as Usuario, 'cambiarle el rol')
  }

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
    await exigirOtroAdminActivo(usuario as Usuario, 'desactivarlo')
  }

  const { data, error } = await supabase
    .from('usuarios')
    .update({ activo: !usuario.activo })
    .eq('id', usuarioId)
    .select('id')

  if (error) throw new Error(`Error al cambiar estado del usuario: ${error.message}`)
  exigirFilaAfectada(data, 'cambiar el estado del usuario')
}

export interface ResultadoBorradoUsuario {
  cuentaBorrada: boolean
  aviso?: string
}

/**
 * Borra un usuario por completo: su fila en `usuarios` y su cuenta de acceso.
 * A diferencia de `alternarActivoUsuario`, no hay vuelta atrás — por eso pasa
 * por la Edge Function `eliminar-usuario`, que rechaza el borrado mientras el
 * usuario tenga actividad clínica o de caja firmada (comprobación que el
 * navegador no puede hacer: el superadmin no tiene RLS sobre esas tablas) o
 * sea el único admin activo de su clínica.
 */
export async function borrarUsuario(usuarioId: string): Promise<ResultadoBorradoUsuario> {
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean
    cuenta_borrada?: boolean
    aviso?: string
    error?: string
  }>('eliminar-usuario', { body: { usuario_id: usuarioId } })

  if (error) throw new Error((await motivoDelFallo(error)) ?? 'No se pudo borrar el usuario')
  if (!data || data.error) throw new Error(data?.error ?? 'No se pudo borrar el usuario')

  return { cuentaBorrada: data.cuenta_borrada ?? false, aviso: data.aviso }
}

/* ============================================================
 * Comprobantes de la suscripción (migración 0020)
 * ============================================================
 * La clínica los envía desde su pantalla de Facturación y solo puede INSERTAR:
 * aprobar o rechazar vive aquí, bajo `pagos_plataforma` y `clinicas_plataforma`,
 * que son policies de superadmin. Que la clínica no pueda tocar su propio
 * estado es toda la razón de que estas dos funciones no estén en
 * `services/facturacion.ts`.
 */

export interface PagoConClinica extends PagoSuscripcion {
  clinica_nombre: string
  responsable: string
  whatsapp: string
  /** Fecha de cobro de HOY, para enseñar a cuál se moverá al aprobar. */
  proximo_cobro: string
}

/** Comprobantes esperando revisión, del más antiguo al más reciente. */
export async function listPagosPendientes(): Promise<PagoConClinica[]> {
  const { data: pagos, error } = await supabase
    .from('pagos_suscripcion')
    .select('*')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true })

  if (error) throw new Error(`No se pudieron cargar los comprobantes: ${error.message}`)
  if (!pagos || pagos.length === 0) return []

  const { data: clinicas } = await supabase
    .from('clinicas')
    .select('id, nombre, responsable, whatsapp, proximo_cobro')
    .in('id', [...new Set(pagos.map((p) => p.clinica_id))])

  const porId = new Map((clinicas ?? []).map((c) => [c.id, c]))

  return pagos.map((p) => {
    const clinica = porId.get(p.clinica_id)
    return {
      ...(p as PagoSuscripcion),
      clinica_nombre: clinica?.nombre ?? 'Clínica',
      responsable: clinica?.responsable ?? '',
      whatsapp: clinica?.whatsapp ?? '',
      proximo_cobro: clinica?.proximo_cobro ?? '',
    }
  })
}

/**
 * Aprueba el comprobante y avanza el cobro, **en una sola sentencia**.
 *
 * Todo el trabajo lo hace `aprobar_pago_suscripcion()` (migración 0021). Antes
 * esto eran tres viajes desde el navegador —marcar el pago, leer la fecha,
 * correrla— y un fallo en el segundo o el tercero dejaba el pago aprobado con
 * la fecha sin mover. Lo peor no era el fallo, era que **desaparecía**:
 * `listPagosPendientes()` filtra por `pendiente`, así que la tarea se iba del
 * asistente, la clínica leía «Aprobado», seguía debiendo y nadie se enteraba.
 * Reintentar tampoco valía: el segundo intento no encontraba fila pendiente.
 *
 * Mismo criterio que `consumir_cuota_whatsapp()`: comprobar y escribir son la
 * misma operación. El `where … and estado = 'pendiente'` de la función sigue
 * haciendo que un doble clic no regale un mes.
 *
 * Devuelve la fecha nueva del próximo cobro. Si la clínica venía muy atrasada,
 * un pago de un mes corre la fecha pero **no** la marca al día: sigue debiendo,
 * y el asistente la vuelve a listar. Eso también lo decide la función.
 */
export async function aprobarPago(pago: PagoSuscripcion): Promise<string> {
  const { data, error } = await supabase.rpc('aprobar_pago_suscripcion', { p_pago_id: pago.id })
  if (error) throw new Error(`No se pudo aprobar el comprobante: ${error.message}`)
  return data as string
}

/**
 * Rechaza el comprobante con un motivo.
 *
 * El motivo es obligatorio y **lo lee la clínica** en su historial: un rechazo
 * mudo la deja sin saber si mandar la misma foto otra vez o hacer otra
 * transferencia. El estado de pago no se toca — sigue debiendo.
 */
export async function rechazarPago(pagoId: string, motivo: string, revisorId: string): Promise<void> {
  if (!motivo.trim()) throw new Error('Explica por qué se rechaza: la clínica va a leerlo')

  const { data, error } = await supabase
    .from('pagos_suscripcion')
    .update({
      estado: 'rechazado',
      motivo_rechazo: motivo.trim(),
      revisado_por: revisorId,
      revisado_at: new Date().toISOString(),
    })
    .eq('id', pagoId)
    .eq('estado', 'pendiente')
    .select('id')

  if (error) throw new Error(`No se pudo rechazar el comprobante: ${error.message}`)
  exigirFilaAfectada(data, 'rechazar el comprobante')
}
