import { supabase } from '../lib/supabase'
import type {
  Cita,
  ConsentimientoCirugia,
  Paciente,
  HistorialClinico,
  RecetaItem,
  VacunaAplicada,
} from '../types/database'
import type { EstudioImagen } from './estudios'
import type { InformeFirmado } from './informes'
import type { FichaPaciente } from '../types/views'

/**
 * Lo que el portal puede llenar de una `FichaPaciente`.
 *
 * Es el mismo tipo, no una copia: las páginas de documento reciben esto o la
 * ficha del personal sin distinguirlas. `internaciones` y `citas` van siempre
 * vacías —son de personal— y eso es parte del contrato, no un descuido.
 */
export type FichaPacientePortal = FichaPaciente
import { addDays } from 'date-fns'
import { clinicDayIso, desdeFechaSola, formatClinicTime } from '../lib/datetime'
import { TIPO_LABEL } from '../lib/citas'
import { ESTADO_ORDEN_LABEL } from '../services/peluqueria'
import type { EstadoOrdenPeluqueria, TipoCita } from '../types/database'

export interface NotificacionPortal {
  id: string;
  /**
   * De dónde sale la fila, que es lo que decide el icono y el color.
   *
   * `peluqueria` es una **orden** de `peluqueria_ordenes`, no una cita: la
   * peluquería agenda ahí, no en `citas` (ver `getNotificacionesPortal`).
   */
  tipo: 'cita' | 'vacuna' | 'peluqueria';
  titulo: string;
  descripcion: string;
  /**
   * Puede venir con hora (`citas`, órdenes) o ser una fecha suelta
   * (`vacunas_aplicadas.fecha_refuerzo`, columna `date`). **Para ordenar y
   * para pintar hay que pasarla siempre por `instanteDeNotificacion()`**: es
   * exactamente lo que estaba mal — se ordenaba por el valor crudo y se
   * pintaba por el normalizado, así que la lista salía en un orden distinto
   * del que se veía.
   */
  fecha: string;
  pacienteNombre: string;
  estado: 'pendiente' | 'atrasada' | 'hoy' | 'en_curso';
}

/**
 * El instante que representa una notificación, sea cual sea su origen.
 *
 * `fecha_refuerzo` es una columna `date`: `new Date('2026-08-20')` es
 * medianoche **UTC**, o sea el día 19 a las 20:00 en La Paz. Ordenar por eso
 * metía un refuerzo del 20 por delante de una cita del 19 por la tarde.
 * `desdeFechaSola` la lleva al mediodía UTC —las 08:00 de La Paz—, que es lo
 * que la pantalla ya usaba para escribirla.
 */
export function instanteDeNotificacion(fecha: string): string {
  return fecha.length <= 10 ? desdeFechaSola(fecha) : fecha
}

/** Lo único que un anónimo puede saber de una clínica: cómo se llama. */
export interface ClinicaParaRegistro {
  id: string
  nombre: string
}

/**
 * El listado sale de una función `security definer`, no de la tabla: quien está
 * en el formulario de registro no tiene sesión y la RLS no le deja leer
 * `clinicas`. La función devuelve solo `id` y `nombre` — ni WhatsApp, ni
 * responsable, ni estado, ni plan contratado.
 */
export async function listClinicasParaRegistro(): Promise<ClinicaParaRegistro[]> {
  const { data, error } = await supabase.rpc('clinicas_para_registro')
  if (error) throw new Error('No se pudieron cargar las clínicas')
  return (data ?? []) as ClinicaParaRegistro[]
}

export interface DatosRegistroPortal {
  clinica_id: string
  nombre: string
  email: string
  password: string
  ci: string
  whatsapp: string
}

/**
 * Por qué se vinculó (o no) la cuenta nueva con la ficha que la clínica ya
 * tuviera. Lo decide `registro-portal`; aquí solo se transporta para poder
 * explicárselo a quien se registra.
 *
 * - `ci_y_whatsapp`  — coincidieron los dos. Vinculado.
 * - `whatsapp_unico` — la ficha no tenía CI anotado y era la única con ese
 *                      número en esa clínica. Vinculado.
 * - `ambiguo`        — varias fichas sin CI comparten ese número: no se
 *                      vincula ninguna, lo confirma la clínica a mano.
 * - `sin_coincidencia` — no había ninguna ficha que casara.
 */
export type MotivoVinculo = 'ci_y_whatsapp' | 'whatsapp_unico' | 'sin_coincidencia' | 'ambiguo'

export interface ResultadoRegistro {
  vinculado: boolean
  motivo: MotivoVinculo
}

/**
 * Alta de una cuenta del portal.
 *
 * Pasa por la Edge Function `registro-portal` porque **el rol y la clínica no
 * pueden venir del navegador**: allí `rol: 'cliente'` es una constante del
 * servidor y la clínica se valida contra la base. Insertar en `usuarios` desde
 * aquí sería mandar el rol en una petición HTTP que cualquiera puede reescribir.
 *
 * La función tampoco devuelve sesión: se inicia después con la contraseña
 * recién elegida, igual que en el canje de invitación.
 */
export async function registrarClientePortal(datos: DatosRegistroPortal): Promise<ResultadoRegistro> {
  const { data, error } = await supabase.functions.invoke<{
    error?: string
    vinculado?: boolean
    motivo?: MotivoVinculo
  }>('registro-portal', {
    body: datos,
  })

  if (error) {
    const contexto = (error as { context?: Response }).context
    let motivo: string | null = null
    if (contexto && typeof contexto.json === 'function') {
      try {
        const cuerpo = await contexto.clone().json()
        if (typeof cuerpo?.error === 'string') motivo = cuerpo.error
      } catch {
        motivo = null
      }
    }
    throw new Error(motivo ?? 'No se pudo completar el registro')
  }
  if (data?.error) throw new Error(data.error)

  const { error: errorSesion } = await supabase.auth.signInWithPassword({
    email: datos.email.trim().toLowerCase(),
    password: datos.password,
  })
  if (errorSesion) {
    throw new Error('Tu cuenta se creó, pero no se pudo iniciar sesión. Entra desde el inicio de sesión.')
  }

  // Una cuenta creada sin vincular es un éxito a medias: la sesión funciona,
  // pero el portal sale vacío. Sin esto el dueño no tenía forma de saber que
  // faltaba algo ni a quién pedírselo.
  return { vinculado: data?.vinculado === true, motivo: data?.motivo ?? 'sin_coincidencia' }
}

export async function getPacientesPortal(clinicaId: string, usuarioId: string): Promise<Paciente[]> {
  const { data: cliente, error: errCliente } = await supabase
    .from('clientes')
    .select('id')
    .eq('clinica_id', clinicaId)
    .eq('usuario_id' as any, usuarioId)
    .maybeSingle()

  // Sin esto, un fallo de RLS o de red devolvia `data` en null y la
  // pantalla decia «no tienes nada» en vez de decir que fallo. Es la razon
  // de que un portal vacio fuera indistinguible de un portal roto.
  if (errCliente) throw new Error(`No se pudo cargar tu ficha: ${errCliente.message}`)
  if (!cliente) return []

  const { data: pacientes, error: errPacientes } = await supabase
    .from('pacientes')
    .select('*')
    .eq('clinica_id', clinicaId)
    .eq('cliente_id', cliente.id)

  if (errPacientes) throw new Error(`No se pudieron cargar tus mascotas: ${errPacientes.message}`)
  return (pacientes || []) as Paciente[]
}

export async function getHistorialPacientePortal(clinicaId: string, pacienteId: string): Promise<HistorialClinico[]> {
  const { data: historial, error: errHistorial } = await supabase
    .from('historial_clinico')
    .select('*')
    .eq('clinica_id', clinicaId)
    .eq('paciente_id', pacienteId)
    .eq('editable', false)
    .order('created_at', { ascending: false })

  if (errHistorial) throw new Error(`No se pudo cargar el historial: ${errHistorial.message}`)
  return (historial || []) as HistorialClinico[]
}

export async function getVacunasPacientePortal(clinicaId: string, pacienteId: string): Promise<VacunaAplicada[]> {
  const { data: vacunas, error: errVacunas } = await supabase
    .from('vacunas_aplicadas')
    .select('*')
    .eq('clinica_id', clinicaId)
    .eq('paciente_id', pacienteId)
    .order('fecha_aplicacion', { ascending: false })

  if (errVacunas) throw new Error(`No se pudieron cargar las vacunas: ${errVacunas.message}`)
  return (vacunas || []) as VacunaAplicada[]
}

/**
 * Consentimientos de cirugía que el tutor firmó, para que pueda releer y
 * reimprimir lo que autorizó.
 *
 * Lo hace visible la policy `consentimientos_portal` (0012): la de personal
 * exige `auth_es_personal()`, así que antes el dueño no veía ni su propia firma.
 */
export async function getConsentimientosPacientePortal(
  clinicaId: string,
  pacienteId: string,
): Promise<ConsentimientoCirugia[]> {
  const { data: consentimientos, error: errConsent } = await supabase
    .from('consentimientos_cirugia')
    .select('*')
    .eq('clinica_id', clinicaId)
    .eq('paciente_id', pacienteId)
    .order('created_at', { ascending: false })

  if (errConsent) throw new Error(`No se pudieron cargar los consentimientos: ${errConsent.message}`)
  return (consentimientos || []) as ConsentimientoCirugia[]
}

/**
 * Recetas de las mascotas del dueño.
 *
 * No existía, y el tour de bienvenida del portal se las promete desde que
 * existe («…y las recetas que le dio el veterinario»): el dueño entraba a
 * buscarlas y no había ninguna pantalla que las pintara. La policy
 * `recetas_portal` (0008) ya estaba, y como ella solo devuelve las de consultas
 * cerradas.
 */
export async function getRecetasPacientePortal(
  clinicaId: string,
  pacienteId: string,
): Promise<RecetaItem[]> {
  const { data } = await supabase
    .from('recetas')
    .select('*')
    .eq('clinica_id', clinicaId)
    .eq('paciente_id', pacienteId)
    .order('created_at', { ascending: false })

  return (data || []) as RecetaItem[]
}

/**
 * Las visitas de la mascota: sus citas, pasadas y futuras.
 *
 * ⚠️ **Sin esto el dueño no veía que hubiera venido nunca.** La ficha del
 * portal solo pintaba `historial_clinico` con `editable = false`, o sea las
 * consultas que el veterinario ya firmó. Mientras siguieran en borrador —lo
 * normal durante horas o días— la pantalla decía «No hay registros clínicos
 * finalizados» y ahí se acababa: ni la fecha en que vino, ni a qué. Y «Citas»
 * tampoco las enseña, porque esa pantalla es de lo que viene, no de lo que
 * pasó.
 *
 * La policy `citas_portal` (0004) ya lo permitía; simplemente nadie lo pedía.
 */
export async function getCitasPacientePortal(
  clinicaId: string,
  pacienteId: string,
): Promise<Cita[]> {
  const { data, error } = await supabase
    .from('citas')
    .select('*')
    .eq('clinica_id', clinicaId)
    .eq('paciente_id', pacienteId)
    .order('fecha_hora', { ascending: false })

  if (error) throw new Error(`No se pudieron cargar las visitas: ${error.message}`)
  return (data || []) as Cita[]
}

/**
 * Informes firmados de las mascotas del dueño (`informes_firmados_portal`, 0015).
 *
 * Se queda con el más reciente de cada `(tipo, item_id)`, igual que
 * `listInformesDePaciente` en el lado de la clínica: la tabla es INSERT-only y
 * volver a firmar añade una fila, no la reemplaza.
 */
export async function getInformesPacientePortal(pacienteId: string): Promise<InformeFirmado[]> {
  const { data } = await supabase
    .from('informes_firmados')
    .select('*')
    .eq('paciente_id', pacienteId)
    .order('created_at', { ascending: false })

  const vistos = new Set<string>()
  return ((data || []) as InformeFirmado[]).filter((i) => {
    const clave = `${i.tipo}|${i.item_id ?? ''}`
    if (vistos.has(clave)) return false
    vistos.add(clave)
    return true
  })
}

/**
 * Estudios de imagen de las mascotas del dueño.
 *
 * `estudios_portal` (0016) solo devuelve los de consultas ya cerradas: un
 * borrador es trabajo en curso del veterinario. Las imágenes viven en un bucket
 * privado, así que la pantalla pide una URL firmada por cada una.
 */
export async function getEstudiosPacientePortal(
  clinicaId: string,
  pacienteId: string,
): Promise<EstudioImagen[]> {
  const { data } = await supabase
    .from('estudios_imagen')
    .select('*')
    .eq('clinica_id', clinicaId)
    .eq('paciente_id', pacienteId)
    .order('created_at', { ascending: false })

  return (data || []) as EstudioImagen[]
}

/**
 * La ficha que necesitan las páginas de impresión cuando quien mira es el dueño.
 *
 * Devuelve la misma forma que `getFichaPaciente`, y por eso las cuatro páginas
 * de documento sirven a los dos roles sin duplicarse. Lo que cambia es **qué se
 * consulta**, y no por comodidad:
 *
 * - `getFichaPaciente` hace `select('*')` sobre `usuarios`, y un `cliente`
 *   tiene `clinica_id`, así que `usuarios_select` se lo permitiría: le bajaría
 *   al celular el directorio del personal con correos y teléfonos. Aquí los
 *   nombres de veterinario se resuelven con un `.in('id', […])` acotado a los
 *   que firman sus propias consultas.
 * - `servicios`, `productos`, `movimientos_inventario` e `internaciones` son de
 *   personal: para el dueño volverían vacías en silencio. Se omiten, y con
 *   ellas el consumo de inventario y los precios internos, que no tienen por
 *   qué salir en el papel del cliente.
 *
 * El recorte de qué consultas se ven no está aquí sino en la RLS
 * (`historial_portal`, `recetas_portal`): solo las cerradas.
 */
export async function getFichaPacientePortal(pacienteId: string): Promise<FichaPacientePortal | null> {
  const { data: paciente } = await supabase
    .from('pacientes')
    .select('*')
    .eq('id', pacienteId)
    .maybeSingle()

  if (!paciente) return null

  const { data: cliente, error: errCliente } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', paciente.cliente_id)
    .maybeSingle()

  if (errCliente) throw new Error(`No se pudo cargar la ficha: ${errCliente.message}`)

  const [{ data: historiales }, { data: vacunas }, { data: desparasitaciones }, { data: recetas }, { data: citas }] =
    await Promise.all([
      supabase.from('historial_clinico').select('*').eq('paciente_id', pacienteId).eq('editable', false),
      supabase.from('vacunas_aplicadas').select('*').eq('paciente_id', pacienteId),
      supabase.from('desparasitaciones_aplicadas').select('*').eq('paciente_id', pacienteId),
      supabase.from('recetas').select('*').eq('paciente_id', pacienteId),
      supabase.from('citas').select('*').eq('paciente_id', pacienteId),
    ])

  // Solo los veterinarios que firman ESTAS consultas, no la plantilla entera.
  const veterinarioIds = [...new Set((historiales ?? []).map((h: any) => h.veterinario_id).filter(Boolean))]
  const { data: veterinarios } = veterinarioIds.length
    ? await supabase.from('usuarios').select('id, nombre').in('id', veterinarioIds)
    : { data: [] as { id: string; nombre: string }[] }

  const nombreDe = (id: string | null | undefined) =>
    (veterinarios ?? []).find((u) => u.id === id)?.nombre ?? 'Veterinario'

  const historialesConDetalle = (historiales ?? [])
    .map((h: any) => ({
      ...h,
      veterinario_nombre: nombreDe(h.veterinario_id),
      vacunas: (vacunas ?? []).filter((v: any) => v.historial_id === h.id),
      desparasitaciones: (desparasitaciones ?? []).filter((d: any) => d.historial_id === h.id),
      // Vacío a propósito: el consumo de inventario es interno de la clínica.
      productosUsados: [],
      receta: (recetas ?? []).filter((r: any) => r.historial_id === h.id),
      tipo_cita: (citas ?? []).find((c: any) => c.id === h.cita_id)?.tipo_cita ?? 'consulta',
      procedimiento: null,
      origen: null,
    }))
    .sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))

  return {
    paciente: { ...paciente, cliente },
    historiales: historialesConDetalle,
    internaciones: [],
    citas: [],
    vacunas: (vacunas ?? []).sort((a: any, b: any) =>
      b.fecha_aplicacion.localeCompare(a.fecha_aplicacion),
    ),
    desparasitaciones: (desparasitaciones ?? []).sort((a: any, b: any) =>
      b.fecha_aplicacion.localeCompare(a.fecha_aplicacion),
    ),
  } as FichaPacientePortal
}

export async function getNotificacionesPortal(clinicaId: string, usuarioId: string): Promise<NotificacionPortal[]> {
  const { data: cliente, error: errCliente } = await supabase
    .from('clientes')
    .select('id')
    .eq('clinica_id', clinicaId)
    .eq('usuario_id' as any, usuarioId)
    .maybeSingle()

  // Sin esto, un fallo de RLS o de red devolvia `data` en null y la
  // pantalla decia «no tienes nada» en vez de decir que fallo. Es la razon
  // de que un portal vacio fuera indistinguible de un portal roto.
  if (errCliente) throw new Error(`No se pudo cargar tu ficha: ${errCliente.message}`)
  if (!cliente) return []

  const { data: pacientes, error: errPacientes } = await supabase
    .from('pacientes')
    .select('id, nombre')
    .eq('clinica_id', clinicaId)
    .eq('cliente_id', cliente.id)

  if (errPacientes) throw new Error(`No se pudieron cargar tus mascotas: ${errPacientes.message}`)
  if (!pacientes || pacientes.length === 0) return []

  const pacienteIds = pacientes.map(p => p.id)
  const notificaciones: NotificacionPortal[] = []
  const hoy = clinicDayIso()

  // 1. Citas pendientes
  const { data: citas } = await supabase
    .from('citas')
    .select('*')
    .eq('clinica_id', clinicaId)
    .in('paciente_id', pacienteIds)
    .in('estado', ['pendiente', 'confirmada'])

  if (citas) {
    citas.forEach(cita => {
      const p = pacientes.find(x => x.id === cita.paciente_id)
      // Se compara el día de la clínica, no el del dispositivo del cliente:
      // `isPast`/`isToday` resolvían en la zona de su teléfono, que puede estar
      // en cualquier parte.
      const diaCita = clinicDayIso(cita.fecha_hora)

      if (diaCita < hoy) return

      // El rótulo salía de un ternario sobre `tipo_cita === 'vacuna'`, así que
      // los otros cinco tipos —peluquería incluida— decían «Cita Veterinaria».
      // `TIPO_LABEL` es la misma tabla que usa el personal en la agenda.
      const tipoCita = cita.tipo_cita as TipoCita
      notificaciones.push({
        id: `cita-${cita.id}`,
        tipo: tipoCita === 'peluqueria' ? 'peluqueria' : 'cita',
        titulo: TIPO_LABEL[tipoCita] ?? 'Cita',
        descripcion: `Agendada a las ${formatClinicTime(cita.fecha_hora)}.`,
        fecha: cita.fecha_hora,
        pacienteNombre: p?.nombre || 'Tu mascota',
        estado: diaCita === hoy ? 'hoy' : 'pendiente'
      })
    })
  }

  // 1b. Órdenes de peluquería
  //
  // La peluquería NO agenda en `citas`: su agenda lee `peluqueria_ordenes`, y
  // la casilla que además crea la cita (`crearCitaSimultanea` en
  // `NuevaOrdenModal`) viene DESMARCADA por defecto. Sin esto, el dueño no veía
  // ni una sola de sus citas de peluquería.
  //
  // La policy `peluqueria_ordenes_portal` (0029) ya le deja leer las suyas, así
  // que no hizo falta SQL nuevo.
  const ESTADOS_VIVOS: EstadoOrdenPeluqueria[] = [
    'cita', 'recepcion', 'evaluacion', 'en_espera', 'en_proceso', 'terminada', 'lista_recoger',
  ]
  const { data: ordenes } = await supabase
    .from('peluqueria_ordenes')
    .select('*')
    .eq('clinica_id', clinicaId)
    .in('paciente_id', pacienteIds)
    .in('estado', ESTADOS_VIVOS)
    // Las que tienen cita ya vienen por el bloque de arriba: sin esto saldrían
    // dos veces, la misma peluquería el mismo día.
    .is('cita_id', null)

  if (ordenes) {
    ordenes.forEach(orden => {
      const p = pacientes.find(x => x.id === orden.paciente_id)
      const estadoOrden = orden.estado as EstadoOrdenPeluqueria
      const diaOrden = clinicDayIso(orden.hora_ingreso)

      // Una orden ya recibida es trabajo EN CURSO, no una cita de un día: «en
      // proceso» o «lista para recoger» es lo que el dueño quiere ver ahora
      // mismo, y por eso va en su propio grupo, arriba del todo.
      const enCurso = estadoOrden !== 'cita'
      if (!enCurso && diaOrden < hoy) return

      notificaciones.push({
        id: `orden-${orden.id}`,
        tipo: 'peluqueria',
        titulo: 'Peluquería / Estética',
        descripcion: ESTADO_ORDEN_LABEL[estadoOrden],
        fecha: orden.hora_ingreso,
        pacienteNombre: p?.nombre || 'Tu mascota',
        estado: enCurso ? 'en_curso' : diaOrden === hoy ? 'hoy' : 'pendiente',
      })
    })
  }

  // 2. Vacunas pendientes o atrasadas (refuerzos)
  const { data: vacunas, error: errVacunas } = await supabase
    .from('vacunas_aplicadas')
    .select('*')
    .eq('clinica_id', clinicaId)
    .in('paciente_id', pacienteIds)
    .not('fecha_refuerzo', 'is', null)

  if (errVacunas) throw new Error(`No se pudieron cargar los refuerzos: ${errVacunas.message}`)
  if (vacunas) {
    vacunas.forEach(vacuna => {
      const p = pacientes.find(x => x.id === vacuna.paciente_id)
      // `fecha_refuerzo` es una columna `date`. `new Date("2026-08-20")` es
      // medianoche UTC, o sea el día 19 a las 20:00 en La Paz: el refuerzo se
      // marcaba "atrasado" desde la víspera y el carné mostraba un día menos.
      // Comparar cadenas 'yyyy-MM-dd' del día de la clínica es exacto.
      const diaRefuerzo = vacuna.fecha_refuerzo!.slice(0, 10)
      const limite = clinicDayIso(addDays(new Date(), 30).toISOString())

      if (diaRefuerzo <= limite) {
        let estado: 'pendiente' | 'atrasada' | 'hoy' = 'pendiente'
        if (diaRefuerzo === hoy) estado = 'hoy'
        else if (diaRefuerzo < hoy) estado = 'atrasada'

        notificaciones.push({
          id: `vac-${vacuna.id}`,
          tipo: 'vacuna',
          titulo: `Refuerzo: ${vacuna.nombre_vacuna}`,
          descripcion: estado === 'atrasada' ? 'Refuerzo atrasado. Contáctanos.' : 'Refuerzo programado.',
          fecha: vacuna.fecha_refuerzo!,
          pacienteNombre: p?.nombre || 'Tu mascota',
          estado
        })
      }
    })
  }

  // Por el MISMO instante que se pinta. Antes se ordenaba por `a.fecha` cruda
  // y se dibujaba por la normalizada, así que la lista salía en un orden
  // distinto del que se leía en pantalla.
  return notificaciones.sort(
    (a, b) =>
      new Date(instanteDeNotificacion(a.fecha)).getTime() -
      new Date(instanteDeNotificacion(b.fecha)).getTime(),
  )
}
