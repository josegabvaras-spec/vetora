import { supabase } from '../lib/supabase'
import { DIAS_ANTICIPACION, diasDeDiferencia } from '../lib/asistente'
import { TIPO_LABEL } from '../lib/citas'
import { clinicDayIso, desdeFechaSola, formatClinicDate, fromClinicTime } from '../lib/datetime'
import { enviarMensajeWhatsapp } from './whatsapp'
import { listLotes } from './petshop'
import type { Cita, Paciente } from '../types/database'
import type { CitaConDetalle, Programado, ResumenDelDia, TipoAviso } from '../types/views'

/**
 * Tope de la barrida de cartera.
 *
 * Cumpleaños y pacientes inactivos obligan a mirar TODOS los pacientes: no hay
 * forma de filtrar "cumple hoy" desde PostgREST sin una función en la base.
 * Hasta que exista, el límite es explícito en vez de ser el corte invisible de
 * 1000 filas de PostgREST — que es lo que había antes y hacía desaparecer
 * avisos sin decir nada. Para pasar de aquí hace falta un RPC.
 */
const TOPE_CARTERA = 5000

/**
 * Ventana de citas que necesitan los avisos.
 *
 * Hacia atrás: 400 días, porque el aviso de "paciente inactivo" pregunta si
 * hace **365** que no viene. Quien no tenga ninguna cita en esta ventana está,
 * por definición, por encima de ese umbral, así que el resultado no cambia.
 * Hacia delante: 30 días, de sobra para la mayor `DIAS_ANTICIPACION`.
 */
const DIAS_ATRAS = 400
const DIAS_ADELANTE = 30

function ventanaDeAvisos(): { desde: string; hasta: string } {
  const desde = new Date()
  desde.setDate(desde.getDate() - DIAS_ATRAS)
  const hasta = new Date()
  hasta.setDate(hasta.getDate() + DIAS_ADELANTE)
  return { desde: desde.toISOString(), hasta: hasta.toISOString() }
}

export async function listProgramados(sucursalId?: string): Promise<Programado[]> {
  const { desde, hasta } = ventanaDeAvisos()

  const { data: pacientes } = await supabase.from('pacientes').select('*').limit(TOPE_CARTERA)
  const { data: clientes } = await supabase.from('clientes').select('*').limit(TOPE_CARTERA)
  const { data: servicios } = await supabase.from('servicios').select('*')

  let citasQuery = supabase
    .from('citas')
    .select('*')
    .gte('fecha_hora', desde)
    .lte('fecha_hora', hasta)
  if (sucursalId) citasQuery = citasQuery.eq('sucursal_id', sucursalId)
  const { data: citas } = await citasQuery

  const dueno = (paciente: any) => clientes?.find((c) => c.id === paciente.cliente_id)
  const pacienteDe = (id: string) => pacientes?.find((p) => p.id === id)

  function base(paciente: any) {
    const cliente = dueno(paciente)
    return {
      paciente_id: paciente.id,
      paciente_nombre: paciente.nombre,
      especie: paciente.especie,
      cliente_nombre: cliente?.nombre ?? 'Cliente',
      whatsapp: cliente?.whatsapp ?? '',
    }
  }

  function dentroDeVentana(fechaIso: string, tipo: TipoAviso): boolean {
    const dias = diasDeDiferencia(fechaIso)
    return dias <= DIAS_ANTICIPACION[tipo]
  }

  const avisos: Programado[] = []

  // 1. Citas próximas: recordatorio, o preparación cuando es cirugía.
  for (const cita of (citas || []) as Cita[]) {
    if (cita.estado !== 'pendiente' && cita.estado !== 'confirmada') continue
    const paciente = pacienteDe(cita.paciente_id)
    if (!paciente) continue

    const tipo: TipoAviso = cita.tipo_cita === 'cirugia' ? 'preparacion_cirugia' : 'recordatorio_cita'
    const dias = diasDeDiferencia(cita.fecha_hora)
    if (dias < 0 || !dentroDeVentana(cita.fecha_hora, tipo)) continue

    avisos.push({
      id: `${tipo}-${cita.id}`,
      tipo,
      referencia_id: cita.id,
      ...base(paciente),
      fecha: cita.fecha_hora,
      vencido: false,
      detalle:
        servicios?.find((s) => s.id === cita.servicio_id)?.nombre ??
        cita.notas?.trim() ??
        TIPO_LABEL[cita.tipo_cita],
      ya_avisado: cita.recordatorio_enviado,
    })
  }

  // Tope explícito, no filtro por fecha: el bucle de abajo SÍ muestra refuerzos
  // vencidos por antiguos que sean (`dentroDeVentana` acepta los días negativos),
  // así que acotar por `fecha_refuerzo` cambiaría qué avisos aparecen. Esto solo
  // convierte el corte invisible de 1000 filas en uno explícito y documentado.
  const { data: vacunas } = await supabase.from('vacunas_aplicadas').select('*').limit(TOPE_CARTERA)
  for (const vacuna of (vacunas || [])) {
    if (!vacuna.fecha_refuerzo) continue
    const paciente = pacienteDe(vacuna.paciente_id)
    if (!paciente) continue
    if (yaSeAplico(vacunas || [], vacuna.paciente_id, vacuna.fecha_refuerzo, vacuna.nombre_vacuna)) continue
    if (tieneCitaFutura(citas || [], vacuna.paciente_id, 'vacuna')) continue
    const refuerzo = desdeFechaSola(vacuna.fecha_refuerzo)
    if (!dentroDeVentana(refuerzo, 'refuerzo_vacuna')) continue

    avisos.push({
      id: `refuerzo_vacuna-${vacuna.id}`,
      tipo: 'refuerzo_vacuna',
      referencia_id: vacuna.id,
      ...base(paciente),
      fecha: refuerzo,
      vencido: diasDeDiferencia(refuerzo) < 0,
      detalle: vacuna.nombre_vacuna,
      ya_avisado: false,
    })
  }

  const { data: desparasitaciones } = await supabase.from('desparasitaciones_aplicadas').select('*').limit(TOPE_CARTERA)
  for (const dosis of (desparasitaciones || [])) {
    if (!dosis.fecha_proxima) continue
    const paciente = pacienteDe(dosis.paciente_id)
    if (!paciente) continue
    if (yaSeAplico(desparasitaciones || [], dosis.paciente_id, dosis.fecha_proxima)) continue
    if (tieneCitaFutura(citas || [], dosis.paciente_id, 'desparasitacion')) continue
    const proxima = desdeFechaSola(dosis.fecha_proxima)
    if (!dentroDeVentana(proxima, 'proxima_desparasitacion')) continue

    avisos.push({
      id: `proxima_desparasitacion-${dosis.id}`,
      tipo: 'proxima_desparasitacion',
      referencia_id: dosis.id,
      ...base(paciente),
      fecha: proxima,
      vencido: diasDeDiferencia(proxima) < 0,
      detalle: dosis.producto,
      ya_avisado: false,
    })
  }

  const hoyStr = new Date().toISOString()
  const diaHoy = formatClinicDate(hoyStr).substring(0, 2)
  const mesHoy = formatClinicDate(hoyStr).substring(3, 5)
  // Solo hace falta saber si las citas de la ventana están cobradas.
  const { data: cobros } = await supabase
    .from('cobros')
    .select('cita_id')
    .gte('created_at', desde)

  // 3. Seguimiento post-consulta y atenciones sin cobrar
  for (const cita of (citas || []) as Cita[]) {
    if (cita.estado !== 'completada') continue
    const dias = diasDeDiferencia(cita.fecha_hora)
    
    if (dias >= -3 && dias <= -1) {
      const paciente = pacienteDe(cita.paciente_id)
      if (paciente) {
        avisos.push({
          id: `seguimiento-${cita.id}`,
          tipo: 'seguimiento_post_consulta',
          referencia_id: cita.id,
          ...base(paciente),
          fecha: cita.fecha_hora,
          vencido: false,
          detalle: servicios?.find((s) => s.id === cita.servicio_id)?.nombre ?? TIPO_LABEL[cita.tipo_cita],
          ya_avisado: false,
        })
      }
    }

    if (dias >= -7 && dias <= -1) {
      if (!(cobros || []).some(c => c.cita_id === cita.id)) {
        const paciente = pacienteDe(cita.paciente_id)
        if (paciente) {
          avisos.push({
            id: `cobro-cita-${cita.id}`,
            tipo: 'atencion_sin_cobrar',
            referencia_id: cita.id,
            ...base(paciente),
            fecha: cita.fecha_hora,
            vencido: true,
            detalle: 'Atención médica',
            ya_avisado: false,
          })
        }
      }
    }
  }

  // 4. Cumpleaños y pacientes inactivos
  for (const paciente of (pacientes || []) as Paciente[]) {
    if (paciente.fecha_nacimiento) {
      const mesNac = paciente.fecha_nacimiento.substring(5, 7)
      const diaNac = paciente.fecha_nacimiento.substring(8, 10)
      if (mesNac === mesHoy && diaNac === diaHoy) {
        avisos.push({
          id: `cumpleanos-${paciente.id}`,
          tipo: 'cumpleanos_paciente',
          referencia_id: paciente.id,
          ...base(paciente),
          fecha: hoyStr,
          vencido: false,
          detalle: 'Cumpleaños de la mascota',
          ya_avisado: false,
        })
      }
    }

    const ultimaCita = (citas || [])
      .filter(c => c.paciente_id === paciente.id && c.estado === 'completada')
      .sort((a, b) => b.fecha_hora.localeCompare(a.fecha_hora))[0]
      
    const diasInactivo = ultimaCita ? Math.abs(diasDeDiferencia(ultimaCita.fecha_hora)) : 365
    if (diasInactivo >= 365) {
      avisos.push({
        id: `inactivo-${paciente.id}`,
        tipo: 'paciente_inactivo',
        referencia_id: paciente.id,
        ...base(paciente),
        fecha: ultimaCita ? ultimaCita.fecha_hora : hoyStr,
        vencido: true,
        detalle: 'Control anual recomendado',
        ya_avisado: false,
      })
    }
  }

  avisos.sort((a, b) => {
    if (a.vencido !== b.vencido) return a.vencido ? -1 : 1
    return a.fecha.localeCompare(b.fecha)
  })

  return avisos
}

export function avisoDeCita(cita: CitaConDetalle): Programado {
  const tipo: TipoAviso = cita.tipo_cita === 'cirugia' ? 'preparacion_cirugia' : 'recordatorio_cita'
  return {
    id: `${tipo}-${cita.id}`,
    tipo,
    referencia_id: cita.id,
    paciente_id: cita.paciente_id,
    paciente_nombre: cita.paciente.nombre,
    especie: cita.paciente.especie,
    cliente_nombre: cita.paciente.cliente.nombre,
    whatsapp: cita.paciente.cliente.whatsapp,
    fecha: cita.fecha_hora,
    vencido: false,
    detalle: cita.servicio_nombre ?? cita.notas?.trim() ?? TIPO_LABEL[cita.tipo_cita],
    ya_avisado: cita.recordatorio_enviado,
  }
}

function yaSeAplico(
  dosis: { paciente_id: string; fecha_aplicacion: string; nombre_vacuna?: string; producto?: string }[],
  pacienteId: string,
  fechaPrevista: string,
  nombre?: string,
): boolean {
  return dosis.some(
    (d) =>
      d.paciente_id === pacienteId &&
      (!nombre || d.nombre_vacuna === nombre) &&
      d.fecha_aplicacion >= fechaPrevista.slice(0, 10),
  )
}

function tieneCitaFutura(citas: any[], pacienteId: string, tipo: string): boolean {
  return citas.some(
    (c) =>
      c.paciente_id === pacienteId &&
      c.tipo_cita === tipo &&
      (c.estado === 'pendiente' || c.estado === 'confirmada') &&
      diasDeDiferencia(c.fecha_hora) >= 0,
  )
}

export async function enviarAviso(
  clinicaId: string,
  aviso: Programado, 
  mensaje: string, 
  destino: 'cliente' | 'equipo' = 'cliente'
): Promise<string> {
  let numeroDestino = aviso.whatsapp
  if (destino === 'equipo') {
    const { data: clinica } = await supabase.from('clinicas').select('whatsapp').eq('id', clinicaId).single()
    if (!clinica?.whatsapp) throw new Error('La clínica no tiene un WhatsApp registrado para recibir avisos internos.')
    numeroDestino = clinica.whatsapp
  }

  const enlace = await enviarMensajeWhatsapp(clinicaId, numeroDestino, mensaje)

  if (destino === 'cliente' && (aviso.tipo === 'recordatorio_cita' || aviso.tipo === 'preparacion_cirugia')) {
    const { data, error } = await supabase
      .from('citas')
      .update({ recordatorio_enviado: true })
      .eq('id', aviso.referencia_id)
      .select('id')

    // No se lanza: el mensaje ya salió y la cuota ya se consumió, así que
    // abortar aquí sería peor. Pero sí se avisa por consola de los dos modos de
    // fallo, incluido el silencioso: si la RLS filtra la fila, PostgREST
    // devuelve 204 con `error: null` y el aviso reaparecería como pendiente sin
    // que nadie entienda por qué.
    if (error) {
      console.error('No se pudo marcar el recordatorio como enviado:', error)
    } else if (!data || data.length === 0) {
      console.error(
        'El recordatorio se envió pero no se pudo marcar en la cita',
        aviso.referencia_id,
        '— sin permiso sobre esa sucursal. Volverá a aparecer como pendiente.',
      )
    }
  }
  return enlace
}

export async function resumenDelDia(sucursalId?: string): Promise<ResumenDelDia> {
  const hoy = new Date().toISOString()
  const esDeHoy = (iso: string) => formatClinicDate(iso) === formatClinicDate(hoy)

  // Ventana: hoy más los siete días que mira el control de consentimientos de
  // cirugía. Antes se traía la tabla entera de citas para quedarse con las de
  // hoy, y por encima de 1000 filas el resumen del día salía vacío.
  const inicioHoy = fromClinicTime(`${clinicDayIso()}T00:00:00`)
  const finVentana = new Date()
  finVentana.setDate(finVentana.getDate() + 8)

  let citasQuery = supabase
    .from('citas')
    .select('*')
    .gte('fecha_hora', inicioHoy)
    .lte('fecha_hora', finVentana.toISOString())
  if (sucursalId) citasQuery = citasQuery.eq('sucursal_id', sucursalId)
  const { data: citas } = await citasQuery

  const citasHoy = (citas || []).filter((c) => esDeHoy(c.fecha_hora) && c.estado !== 'cancelada')

  const idsCitasVentana = (citas || []).map((c: any) => c.id)
  const { data: consentimientos } = idsCitasVentana.length
    ? await supabase.from('consentimientos_cirugia').select('cita_id').in('cita_id', idsCitasVentana)
    : { data: [] as any[] }

  const cirugiasSinConsentimiento = (citas || []).filter(
    (c) =>
      c.tipo_cita === 'cirugia' &&
      (c.estado === 'pendiente' || c.estado === 'confirmada') &&
      diasDeDiferencia(c.fecha_hora) >= 0 &&
      diasDeDiferencia(c.fecha_hora) <= 7 &&
      !(consentimientos || []).some((con) => con.cita_id === c.id),
  ).length

  const avisos = await listProgramados(sucursalId)

  // Sin filtrar por `activo`, un producto dado de baja seguiría generando
  // alertas de stock bajo que ya no hay que reponer.
  let prodQuery = supabase.from('productos').select('*').eq('activo', true)
  if (sucursalId) prodQuery = prodQuery.eq('sucursal_id', sucursalId)
  const { data: productos } = await prodQuery
  const prodBajoStock = (productos || []).filter((p) => p.stock_actual <= p.stock_minimo)

  // Vencimientos. `listLotes` ya trae el semáforo calculado y el producto
  // incrustado; aquí solo se separan los caducados de los que están por
  // caducar, y se descartan los lotes agotados: un lote sin existencias no es
  // un riesgo, es historia.
  const lotes = await listLotes({ sucursalId, estado: 'todos' }).catch(() => [])
  const conExistencias = lotes.filter((l) => Number(l.cantidad_actual) > 0)
  const nombresVencidos = [
    ...new Set(
      conExistencias
        .filter((l) => l.estado_vencimiento === 'vencido')
        .map((l) => l.producto?.nombre)
        .filter((n): n is string => Boolean(n)),
    ),
  ]
  const porVencer = conExistencias.filter((l) => l.estado_vencimiento === 'proximo').length

  // Solo los de hoy: es lo único que se suma. Antes se traía el histórico
  // completo de cobros para descartarlo casi entero, y por encima de 1000
  // filas los de hoy podían no venir en el lote — el resumen decía Bs. 0.00
  // habiendo cobrado.
  let cobrosQuery = supabase
    .from('cobros')
    .select('*')
    .gte('created_at', fromClinicTime(`${clinicDayIso()}T00:00:00`))
  if (sucursalId) cobrosQuery = cobrosQuery.eq('sucursal_id', sucursalId)
  const { data: cobros } = await cobrosQuery
  const ingresosHoy = (cobros || [])
    .filter((c) => esDeHoy(c.created_at))
    .reduce((total, c) => total + c.monto_bs, 0)

  return {
    fecha: hoy,
    citas_hoy: citasHoy.length,
    sin_confirmar: citasHoy.filter((c) => c.estado === 'pendiente').length,
    cirugias_sin_consentimiento: cirugiasSinConsentimiento,
    refuerzos_vencidos: avisos.filter((a) => a.vencido).length,
    productos_bajo_minimo: prodBajoStock.map((p) => p.nombre),
    productos_vencidos: nombresVencidos,
    lotes_por_vencer: porVencer,
    ingresos_hoy_bs: ingresosHoy,
  }
}
