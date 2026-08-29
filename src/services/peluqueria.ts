import { supabase } from '../lib/supabase'
import type { Json } from '../types/supabase'
import type {
  CategoriaGrooming,
  ComportamientoGrooming,
  EstadoOrdenPeluqueria,
  NivelNudos,
  NivelSuciedad,
  PeluqueriaConfiguracion,
  PeluqueriaFicha,
  PeluqueriaFoto,
  PeluqueriaOrden,
  PeluqueriaServicioConfig,
  SuplementoOrden,
  TipoFotoGrooming,
} from '../types/database'
import type {
  InsumoConProducto,
  PeluqueriaOrdenConDetalle,
  PeluqueriaServicioConConfig,
  ResumenDashboardPeluqueria,
} from '../types/views'
import { fromClinicTime } from '../lib/datetime'
import { registrarMovimiento } from './inventario'

export const ESTADO_ORDEN_LABEL: Record<EstadoOrdenPeluqueria, string> = {
  cita: 'Cita programada',
  recepcion: 'Recepción',
  evaluacion: 'Evaluación inicial',
  en_espera: 'En espera',
  en_proceso: 'En proceso',
  terminada: 'Terminada',
  lista_recoger: 'Lista para recoger',
  entregada: 'Entregada',
  cancelada: 'Cancelada',
}

export const ESTADO_ORDEN_TONE: Record<EstadoOrdenPeluqueria, 'slate' | 'indigo' | 'teal' | 'amber' | 'emerald' | 'rose'> = {
  cita: 'slate',
  recepcion: 'indigo',
  evaluacion: 'teal',
  en_espera: 'amber',
  en_proceso: 'amber',
  terminada: 'indigo',
  lista_recoger: 'emerald',
  entregada: 'slate',
  cancelada: 'rose',
}

export const CATEGORIA_GROOMING_LABEL: Record<CategoriaGrooming, string> = {
  bano: 'Baño',
  corte: 'Corte',
  higiene: 'Higiene',
  tratamiento: 'Tratamiento',
  personalizado: 'Personalizado',
}

export const COMPORTAMIENTO_LABEL: Record<ComportamientoGrooming, string> = {
  tranquilo: 'Tranquilo / Sociable',
  nervioso: 'Nervioso / Inquieto',
  agresivo: 'Agresivo / Reactivo',
  miedo_secadora: 'Miedo al ruido / secadora',
  no_tolera_unas: 'No tolera corte de uñas',
  manejo_especial: 'Requiere manejo especial',
}

export const NIVEL_NUDOS_LABEL: Record<NivelNudos, string> = {
  ninguno: 'Sin nudos',
  leve: 'Nudos leves',
  moderado: 'Nudos moderados',
  severo: 'Manto enredado / Nudos severos',
}

export const NIVEL_SUCIEDAD_LABEL: Record<NivelSuciedad, string> = {
  normal: 'Normal',
  alta: 'Muy sucio',
  extrema: 'Extremadamente sucio / Grasa',
}

export interface FiltrosOrdenes {
  sucursalId?: string
  peluqueroId?: string
  estado?: EstadoOrdenPeluqueria
  fecha?: string // YYYY-MM-DD
  pacienteId?: string
  clienteId?: string
  busqueda?: string
}

/** Carga listado de órdenes de peluquería con sus relaciones compuestas */
export async function listOrdenes(filtros: FiltrosOrdenes = {}): Promise<PeluqueriaOrdenConDetalle[]> {
  let query = supabase
    .from('peluqueria_ordenes')
    .select(`
      *,
      paciente:pacientes(*),
      cliente:clientes(*),
      peluquero:usuarios(*),
      servicio:servicios(*),
      fotos:peluqueria_fotos(*)
    `)
    .order('created_at', { ascending: false })

  if (filtros.sucursalId) query = query.eq('sucursal_id', filtros.sucursalId)
  if (filtros.peluqueroId) query = query.eq('peluquero_id', filtros.peluqueroId)
  if (filtros.estado) query = query.eq('estado', filtros.estado)
  if (filtros.pacienteId) query = query.eq('paciente_id', filtros.pacienteId)
  if (filtros.clienteId) query = query.eq('cliente_id', filtros.clienteId)

  if (filtros.fecha) {
    const inicio = fromClinicTime(`${filtros.fecha}T00:00:00`)
    const fin = fromClinicTime(`${filtros.fecha}T23:59:59`)
    query = query.gte('created_at', inicio).lte('created_at', fin)
  }

  const { data, error } = await query
  if (error) throw new Error(`Error al cargar órdenes de peluquería: ${error.message}`)

  let resultado = (data || []) as unknown as PeluqueriaOrdenConDetalle[]

  if (filtros.busqueda?.trim()) {
    const q = filtros.busqueda.toLowerCase().trim()
    resultado = resultado.filter(
      (o) =>
        o.paciente?.nombre?.toLowerCase().includes(q) ||
        o.cliente?.nombre?.toLowerCase().includes(q) ||
        o.cliente?.whatsapp?.includes(q) ||
        o.cliente?.ci?.includes(q) ||
        o.numero_orden.toString().includes(q) ||
        o.servicio?.nombre?.toLowerCase().includes(q),
    )
  }

  return resultado
}

/** Carga detalle de una orden de servicio */
export async function getOrden(id: string): Promise<PeluqueriaOrdenConDetalle> {
  const { data, error } = await supabase
    .from('peluqueria_ordenes')
    .select(`
      *,
      paciente:pacientes(*),
      cliente:clientes(*),
      peluquero:usuarios(*),
      servicio:servicios(*),
      fotos:peluqueria_fotos(*),
      cita:citas(*)
    `)
    .eq('id', id)
    .single()

  if (error || !data) throw new Error(`Error al cargar orden: ${error?.message || 'No encontrada'}`)
  return data as unknown as PeluqueriaOrdenConDetalle
}

export interface DatosNuevaOrden {
  sucursalId: string
  pacienteId: string
  clienteId: string
  peluqueroId: string
  servicioId?: string | null
  citaId?: string | null
  precioEstimadoBs: number
  precioFinalBs: number
  suplementos?: SuplementoOrden[]
  observacionesRecepcion?: string | null
  usuarioId?: string
  crearCitaSimultanea?: boolean
  fechaHoraCita?: string
}

/** Crea una nueva orden de servicio de peluquería */
export async function crearOrden(datos: DatosNuevaOrden): Promise<PeluqueriaOrden> {
  if (!datos.pacienteId) throw new Error('Selecciona un paciente')
  if (!datos.clienteId) throw new Error('Selecciona un cliente')
  if (!datos.peluqueroId) throw new Error('Asigna un peluquero responsable')
  if (datos.precioEstimadoBs < 0 || datos.precioFinalBs < 0) {
    throw new Error('El precio no puede ser negativo')
  }

  let citaId = datos.citaId || null

  // Si se solicita agendar cita en la agenda de Vetora
  if (datos.crearCitaSimultanea && datos.fechaHoraCita) {
    const { data: cita, error: errCita } = await supabase
      .from('citas')
      .insert({
        sucursal_id: datos.sucursalId,
        paciente_id: datos.pacienteId,
        veterinario_id: datos.peluqueroId,
        fecha_hora: datos.fechaHoraCita,
        tipo_cita: 'peluqueria',
        servicio_id: datos.servicioId ?? null,
        notas: datos.observacionesRecepcion || 'Cita de peluquería y estética',
        estado: 'pendiente',
        recordatorio_enviado: false,
      })
      .select()
      .single()

    if (!errCita && cita) {
      citaId = cita.id
    }
  }

  const { data: orden, error } = await supabase
    .from('peluqueria_ordenes')
    .insert({
      sucursal_id: datos.sucursalId,
      paciente_id: datos.pacienteId,
      cliente_id: datos.clienteId,
      peluquero_id: datos.peluqueroId,
      servicio_id: datos.servicioId ?? null,
      cita_id: citaId,
      estado: 'recepcion',
      precio_estimado_bs: datos.precioEstimadoBs,
      precio_final_bs: datos.precioFinalBs,
      suplementos: (datos.suplementos || []) as unknown as Json,
      observaciones_recepcion: datos.observacionesRecepcion || null,
      hora_ingreso: new Date().toISOString(),
    })
    .select()
    .single()

  if (error || !orden) throw new Error(`Error al crear orden de peluquería: ${error?.message || 'desconocido'}`)
  return orden as unknown as PeluqueriaOrden
}

export interface DatosEvaluacionInicial {
  condicionPelaje?: string
  nivelNudos: NivelNudos
  nivelSuciedad: NivelSuciedad
  lesionesVisibles?: string
  alertaVeterinaria: boolean
  comportamientoRecepcion?: string
  suplementos?: SuplementoOrden[]
  precioFinalBs: number
  observacionesRecepcion?: string
}

/** Registra la evaluación inicial del estado del pelaje y salud visible */
export async function registrarEvaluacionInicial(ordenId: string, datos: DatosEvaluacionInicial): Promise<void> {
  const { error } = await supabase
    .from('peluqueria_ordenes')
    .update({
      condicion_pelaje: datos.condicionPelaje || null,
      nivel_nudos: datos.nivelNudos,
      nivel_suciedad: datos.nivelSuciedad,
      lesiones_visibles: datos.lesionesVisibles || null,
      alerta_veterinaria: datos.alertaVeterinaria,
      comportamiento_recepcion: datos.comportamientoRecepcion || null,
      suplementos: (datos.suplementos || []) as unknown as Json,
      precio_final_bs: datos.precioFinalBs,
      observaciones_recepcion: datos.observacionesRecepcion || null,
      estado: 'evaluacion',
    })
    .eq('id', ordenId)

  if (error) throw new Error(`Error al guardar evaluación inicial: ${error.message}`)
}

/** Cambia el estado de la orden en el pipeline con control de tiempos y comisiones */
export async function avanzarEstadoOrden(
  ordenId: string,
  nuevoEstado: EstadoOrdenPeluqueria,
  datosExtra?: {
    observacionesPeluquero?: string
    precioFinalBs?: number
    usuarioId?: string
  },
): Promise<void> {
  const orden = await getOrden(ordenId)
  if (!orden) throw new Error('Orden no encontrada')

  const updates: any = { estado: nuevoEstado }
  const nowIso = new Date().toISOString()

  if (nuevoEstado === 'en_proceso' && !orden.hora_inicio) {
    updates.hora_inicio = nowIso
  } else if (nuevoEstado === 'terminada') {
    if (!orden.hora_fin) updates.hora_fin = nowIso
  } else if (nuevoEstado === 'entregada') {
    if (!orden.hora_entrega) updates.hora_entrega = nowIso
  }

  if (datosExtra?.observacionesPeluquero !== undefined) {
    updates.observaciones_peluquero = datosExtra.observacionesPeluquero
  }
  if (datosExtra?.precioFinalBs !== undefined) {
    updates.precio_final_bs = datosExtra.precioFinalBs
  }

  const { error } = await supabase.from('peluqueria_ordenes').update(updates).eq('id', ordenId)
  if (error) throw new Error(`Error al actualizar estado de la orden: ${error.message}`)

  // Si pasa a terminada o lista para recoger, descontar insumos si aún no se descontaron
  if ((nuevoEstado === 'terminada' || nuevoEstado === 'lista_recoger') && !orden.insumos_descontados) {
    await descontarInsumosDeOrden(ordenId, datosExtra?.usuarioId)
  }

  // Generar o actualizar comisión si corresponde
  if (nuevoEstado === 'terminada' || nuevoEstado === 'lista_recoger' || nuevoEstado === 'entregada') {
    await generarComisionOrden(ordenId)
  }

  // Si la orden tenía cita asociada, actualizar su estado en la agenda
  if (orden.cita_id) {
    if (nuevoEstado === 'entregada') {
      await supabase.from('citas').update({ estado: 'completada' }).eq('id', orden.cita_id)
    } else if (nuevoEstado === 'cancelada') {
      await supabase.from('citas').update({ estado: 'cancelada' }).eq('id', orden.cita_id)
    }
  }
}

/** Descuenta automáticamente los insumos asociados al servicio de la orden en el inventario fraccionado */
export async function descontarInsumosDeOrden(ordenId: string, usuarioId?: string): Promise<void> {
  const orden = await getOrden(ordenId)
  if (!orden || !orden.servicio_id || orden.insumos_descontados) return

  const { data: insumos } = await supabase
    .from('peluqueria_servicio_insumos')
    .select('*, producto:productos(*)')
    .eq('servicio_id', orden.servicio_id)

  if (!insumos || insumos.length === 0) {
    await supabase.from('peluqueria_ordenes').update({ insumos_descontados: true }).eq('id', ordenId)
    return
  }

  for (const item of insumos) {
    try {
      await registrarMovimiento(
        item.producto_id,
        'egreso',
        item.cantidad_dosis,
        `Consumo en Peluquería · Orden #${orden.numero_orden} (${orden.paciente?.nombre || 'Paciente'})`,
        {
          citaId: orden.cita_id ?? undefined,
          usuarioId: usuarioId ?? orden.peluquero_id,
        },
      )
    } catch (err) {
      console.warn(`No se pudo descontar insumo ${item.producto_id}:`, err)
    }
  }

  await supabase.from('peluqueria_ordenes').update({ insumos_descontados: true }).eq('id', ordenId)
}

/** Calcula y registra la comisión del peluquero para la orden */
export async function generarComisionOrden(ordenId: string): Promise<void> {
  const orden = await getOrden(ordenId)
  if (!orden || !orden.peluquero_id) return

  // Verificar si ya existe comisión generada
  const { data: existente } = await supabase
    .from('peluqueria_comisiones')
    .select('id')
    .eq('orden_id', ordenId)
    .maybeSingle()

  if (existente) return

  let porcentaje = 30 // Por defecto 30%
  let tipoComision: 'porcentaje' | 'monto_fijo' = 'porcentaje'
  let comisionBs = 0

  if (orden.servicio_id) {
    const { data: conf } = await supabase
      .from('peluqueria_servicios_config')
      .select('*')
      .eq('servicio_id', orden.servicio_id)
      .maybeSingle()

    if (conf && conf.comision_valor > 0) {
      tipoComision = conf.comision_tipo as 'porcentaje' | 'monto_fijo'
      if (tipoComision === 'porcentaje') {
        porcentaje = conf.comision_valor
        comisionBs = Number(((orden.precio_final_bs * porcentaje) / 100).toFixed(2))
      } else {
        comisionBs = conf.comision_valor
      }
    } else {
      comisionBs = Number(((orden.precio_final_bs * porcentaje) / 100).toFixed(2))
    }
  } else {
    comisionBs = Number(((orden.precio_final_bs * porcentaje) / 100).toFixed(2))
  }

  await supabase.from('peluqueria_comisiones').insert({
    sucursal_id: orden.sucursal_id,
    orden_id: ordenId,
    peluquero_id: orden.peluquero_id,
    monto_base_bs: orden.precio_final_bs,
    tipo_comision: tipoComision,
    valor_comision: porcentaje,
    monto_comision_bs: comisionBs,
    estado: 'pendiente',
  })
}

/** Sube o registra una foto de la orden (antes, durante o después) */
export async function guardarFotoOrden(
  ordenId: string,
  pacienteId: string,
  tipo: TipoFotoGrooming,
  fotoUrl: string,
  notas?: string,
): Promise<PeluqueriaFoto> {
  const { data, error } = await supabase
    .from('peluqueria_fotos')
    .insert({
      orden_id: ordenId,
      paciente_id: pacienteId,
      tipo,
      foto_url: fotoUrl,
      descripcion: notas || null,
    })
    .select()
    .single()

  if (error || !data) throw new Error(`Error al guardar foto: ${error?.message || 'desconocido'}`)
  return data as PeluqueriaFoto
}

/** Carga las fotos de una mascota (para la ficha y el portal de cliente) */
export async function listFotosDePaciente(pacienteId: string): Promise<PeluqueriaFoto[]> {
  const { data, error } = await supabase
    .from('peluqueria_fotos')
    .select('*')
    .eq('paciente_id', pacienteId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Error al cargar fotos: ${error.message}`)
  return (data || []) as PeluqueriaFoto[]
}

/** Obtiene la ficha de grooming de una mascota */
export async function getFichaGrooming(pacienteId: string): Promise<PeluqueriaFicha | null> {
  const { data, error } = await supabase
    .from('peluqueria_fichas')
    .select('*')
    .eq('paciente_id', pacienteId)
    .maybeSingle()

  if (error) throw new Error(`Error al cargar ficha de grooming: ${error.message}`)
  return (data as PeluqueriaFicha) || null
}

/** Guarda o actualiza la ficha de grooming */
export async function guardarFichaGrooming(
  pacienteId: string,
  datos: Partial<Omit<PeluqueriaFicha, 'id' | 'clinica_id' | 'paciente_id' | 'created_at' | 'updated_at'>>,
): Promise<PeluqueriaFicha> {
  const { data: fichaExistente } = await supabase
    .from('peluqueria_fichas')
    .select('id')
    .eq('paciente_id', pacienteId)
    .maybeSingle()

  if (fichaExistente) {
    const { data, error } = await supabase
      .from('peluqueria_fichas')
      .update({
        corte_habitual: datos.corte_habitual || null,
        longitud_preferida: datos.longitud_preferida || null,
        frecuencia_dias: datos.frecuencia_dias ?? 30,
        productos_preferidos: datos.productos_preferidos || null,
        comportamiento: datos.comportamiento || 'tranquilo',
        alergias_sensibilidad: datos.alergias_sensibilidad || null,
        observaciones: datos.observaciones || null,
        updated_at: new Date().toISOString(),
      })
      .eq('paciente_id', pacienteId)
      .select()
      .single()

    if (error || !data) throw new Error(`Error al actualizar ficha de grooming: ${error?.message}`)
    return data as PeluqueriaFicha
  } else {
    const { data, error } = await supabase
      .from('peluqueria_fichas')
      .insert({
        paciente_id: pacienteId,
        comportamiento: datos.comportamiento || 'tranquilo',
        corte_habitual: datos.corte_habitual || null,
        longitud_preferida: datos.longitud_preferida || null,
        frecuencia_dias: datos.frecuencia_dias ?? 30,
        productos_preferidos: datos.productos_preferidos || null,
        alergias_sensibilidad: datos.alergias_sensibilidad || null,
        observaciones: datos.observaciones || null,
      })
      .select()
      .single()

    if (error || !data) throw new Error(`Error al crear ficha de grooming: ${error?.message}`)
    return data as PeluqueriaFicha
  }
}

/** Carga el catálogo completo de servicios de peluquería con sus configuraciones e insumos */
export async function listServiciosPeluqueria(): Promise<PeluqueriaServicioConConfig[]> {
  const { data: servicios, error } = await supabase
    .from('servicios')
    .select('*')
    .eq('categoria', 'peluqueria')
    .order('nombre')

  if (error) throw new Error(`Error al cargar servicios de peluquería: ${error.message}`)

  const servicioIds = (servicios || []).map((s) => s.id)
  if (servicioIds.length === 0) return []

  const [{ data: configs }, { data: insumos }] = await Promise.all([
    supabase.from('peluqueria_servicios_config').select('*').in('servicio_id', servicioIds),
    supabase.from('peluqueria_servicio_insumos').select('*, producto:productos(*)').in('servicio_id', servicioIds),
  ])

  const configMap = new Map((configs || []).map((c) => [c.servicio_id, c as unknown as PeluqueriaServicioConfig]))
  const insumosMap = new Map<string, InsumoConProducto[]>()

  for (const ins of (insumos || []) as any[]) {
    const arr = insumosMap.get(ins.servicio_id) || []
    arr.push(ins)
    insumosMap.set(ins.servicio_id, arr)
  }

  return (servicios || []).map((s) => ({
    ...s,
    config: configMap.get(s.id) || null,
    insumos: insumosMap.get(s.id) || [],
  })) as unknown as PeluqueriaServicioConConfig[]
}

/** Guarda o actualiza la configuración técnica y receta de un servicio */
export async function guardarConfigServicioPeluqueria(
  servicioId: string,
  config: Partial<Omit<PeluqueriaServicioConfig, 'id' | 'clinica_id' | 'servicio_id' | 'created_at' | 'updated_at'>>,
  insumos: { productoId: string; cantidadDosis: number }[],
): Promise<void> {
  const { data: confExistente } = await supabase
    .from('peluqueria_servicios_config')
    .select('id')
    .eq('servicio_id', servicioId)
    .maybeSingle()

  if (confExistente) {
    const { error } = await supabase
      .from('peluqueria_servicios_config')
      .update({
        duracion_minutos: config.duracion_minutos ?? 45,
        categoria_grooming: config.categoria_grooming ?? 'bano',
        especie_permitida: config.especie_permitida ?? 'todos',
        tamano_permitido: config.tamano_permitido ?? 'todos',
        comision_tipo: config.comision_tipo ?? 'porcentaje',
        comision_valor: config.comision_valor ?? 0,
        reglas_precio: (config.reglas_precio ?? []) as unknown as Json,
        activo: config.activo ?? true,
      })
      .eq('servicio_id', servicioId)

    if (error) throw new Error(`Error al actualizar configuración: ${error.message}`)
  } else {
    const { error } = await supabase.from('peluqueria_servicios_config').insert({
      servicio_id: servicioId,
      duracion_minutos: config.duracion_minutos ?? 45,
      categoria_grooming: config.categoria_grooming ?? 'bano',
      especie_permitida: config.especie_permitida ?? 'todos',
      tamano_permitido: config.tamano_permitido ?? 'todos',
      comision_tipo: config.comision_tipo ?? 'porcentaje',
      comision_valor: config.comision_valor ?? 0,
      reglas_precio: (config.reglas_precio ?? []) as unknown as Json,
      activo: config.activo ?? true,
    })

    if (error) throw new Error(`Error al guardar configuración: ${error.message}`)
  }

  // Actualizar receta de insumos
  await supabase.from('peluqueria_servicio_insumos').delete().eq('servicio_id', servicioId)

  if (insumos.length > 0) {
    const rows = insumos.map((i) => ({
      servicio_id: servicioId,
      producto_id: i.productoId,
      cantidad_dosis: i.cantidadDosis,
    }))
    const { error: errIns } = await supabase.from('peluqueria_servicio_insumos').insert(rows)
    if (errIns) throw new Error(`Error al guardar insumos: ${errIns.message}`)
  }
}

/** Carga el resumen del dashboard operativo de peluquería */
export async function getResumenDashboard(sucursalId?: string, fecha?: string): Promise<ResumenDashboardPeluqueria> {
  const hoyStr = fecha || new Date().toISOString().slice(0, 10)
  const ordenes = await listOrdenes({ sucursalId, fecha: hoyStr })

  let citasHoy = 0
  let pendientes = 0
  let enProceso = 0
  let listas = 0
  let entregadas = 0
  let canceladas = 0
  let ingresosHoy = 0

  for (const o of ordenes) {
    citasHoy++
    if (o.estado === 'cita' || o.estado === 'recepcion' || o.estado === 'evaluacion' || o.estado === 'en_espera') {
      pendientes++
    } else if (o.estado === 'en_proceso') {
      enProceso++
    } else if (o.estado === 'terminada' || o.estado === 'lista_recoger') {
      listas++
    } else if (o.estado === 'entregada') {
      entregadas++
      ingresosHoy += o.precio_final_bs
    } else if (o.estado === 'cancelada') {
      canceladas++
    }
  }

  // Comisiones del día
  const inicio = fromClinicTime(`${hoyStr}T00:00:00`)
  const fin = fromClinicTime(`${hoyStr}T23:59:59`)

  let comQuery = supabase.from('peluqueria_comisiones').select('monto_comision_bs').gte('created_at', inicio).lte('created_at', fin)
  if (sucursalId) comQuery = comQuery.eq('sucursal_id', sucursalId)
  const { data: comisiones } = await comQuery

  const comisionesHoy = (comisiones || []).reduce((acc, c) => acc + (Number(c.monto_comision_bs) || 0), 0)

  return {
    citas_hoy: citasHoy,
    servicios_pendientes: pendientes,
    servicios_en_proceso: enProceso,
    mascotas_listas: listas,
    mascotas_entregadas: entregadas,
    canceladas_hoy: canceladas,
    no_asistio_hoy: 0,
    ingresos_hoy_bs: Number(ingresosHoy.toFixed(2)),
    servicios_realizados_hoy: entregadas + listas,
    comisiones_hoy_bs: Number(comisionesHoy.toFixed(2)),
    proximos_servicios: ordenes.slice(0, 8),
  }
}

/** Carga o inicializa la configuración de peluquería de la clínica */
export async function getConfiguracionPeluqueria(): Promise<PeluqueriaConfiguracion> {
  const { data, error } = await supabase.from('peluqueria_configuracion').select('*').maybeSingle()

  if (error) throw new Error(`Error al cargar configuración: ${error.message}`)
  if (data) return data as unknown as PeluqueriaConfiguracion

  return {
    clinica_id: '',
    tiempo_bloqueo_default_min: 45,
    intervalo_recordatorio_dias: 30,
    suplementos_predeterminados: [
      { concepto: 'Desenredado / Nudos excesivos', monto_bs: 25 },
      { concepto: 'Pelaje muy sucio / Doble lavado', monto_bs: 15 },
      { concepto: 'Corte de uñas difícil / Manejo especial', monto_bs: 15 },
      { concepto: 'Tratamiento hidratante especial', monto_bs: 20 },
      { concepto: 'Baño antipulgas medicado extra', monto_bs: 20 },
    ],
    mensaje_listo_whatsapp:
      '¡Hola! 🐾 Te avisamos de {clinica} que {mascota} ya está lista y reluciente para que puedas pasar a recogerla. ✨',
    mensaje_recordatorio_whatsapp:
      '¡Hola! 🐾 En {clinica} recordamos que ya han pasado {dias} días desde el último servicio de {mascota}. ¿Deseas agendar su cita de spa/peluquería esta semana? ✂️',
    updated_at: new Date().toISOString(),
  }
}

/** Guarda la configuración de peluquería */
export async function guardarConfiguracionPeluqueria(
  config: Partial<Omit<PeluqueriaConfiguracion, 'clinica_id' | 'updated_at'>>,
): Promise<void> {
  const { data: existente } = await supabase.from('peluqueria_configuracion').select('clinica_id').maybeSingle()

  const payload: any = {
    updated_at: new Date().toISOString(),
  }
  if (config.tiempo_bloqueo_default_min !== undefined) payload.tiempo_bloqueo_default_min = config.tiempo_bloqueo_default_min
  if (config.intervalo_recordatorio_dias !== undefined) payload.intervalo_recordatorio_dias = config.intervalo_recordatorio_dias
  if (config.suplementos_predeterminados !== undefined) payload.suplementos_predeterminados = config.suplementos_predeterminados as unknown as Json
  if (config.mensaje_listo_whatsapp !== undefined) payload.mensaje_listo_whatsapp = config.mensaje_listo_whatsapp
  if (config.mensaje_recordatorio_whatsapp !== undefined) payload.mensaje_recordatorio_whatsapp = config.mensaje_recordatorio_whatsapp

  if (existente) {
    const { error } = await supabase
      .from('peluqueria_configuracion')
      .update(payload)
      .eq('clinica_id', existente.clinica_id)

    if (error) throw new Error(`Error al actualizar configuración: ${error.message}`)
  } else {
    const { error } = await supabase.from('peluqueria_configuracion').insert(payload)

    if (error) throw new Error(`Error al guardar configuración: ${error.message}`)
  }
}
