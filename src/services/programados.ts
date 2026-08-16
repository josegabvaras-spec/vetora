import { db } from '../mocks/db'
import { DIAS_ANTICIPACION, diasDeDiferencia } from '../lib/asistente'
import { TIPO_LABEL } from '../lib/citas'
import { desdeFechaSola, formatClinicDate } from '../lib/datetime'
import { enviarMensajeWhatsapp } from './whatsapp'
import type { Cita, Paciente } from '../types/database'
import type { CitaConDetalle, Programado, ResumenDelDia, TipoAviso } from '../types/views'

function delay<T>(value: T): Promise<T> {
  return Promise.resolve(value)
}

/**
 * Qué toca avisar (PRD Épica 4). Se deriva de las citas, las vacunas y las
 * desparasitaciones ya registradas: no hay tabla de avisos, así que la lista no
 * puede quedar desincronizada de lo que de verdad hay agendado.
 *
 * Nota sobre "ya avisado": solo las citas lo guardan (`recordatorio_enviado`).
 * Las vacunas y las desparasitaciones son tablas de solo INSERT —expediente
 * clínico—, así que un refuerzo pendiente sigue apareciendo hasta que se
 * registra la dosis nueva o se agenda la cita. Es lo correcto: mientras no se
 * haya puesto, sigue pendiente.
 */
export async function listProgramados(sucursalId?: string): Promise<Programado[]> {
  const pacientes = db.get('pacientes')
  const clientes = db.get('clientes')
  const servicios = db.get('servicios')
  const citas = db.get('citas').filter((c) => !sucursalId || c.sucursal_id === sucursalId)

  const dueno = (paciente: Paciente) => clientes.find((c) => c.id === paciente.cliente_id)
  const pacienteDe = (id: string) => pacientes.find((p) => p.id === id)

  /** Base común: quién es el paciente y por dónde se le escribe a su dueño. */
  function base(paciente: Paciente) {
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
  for (const cita of citas) {
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
        servicios.find((s) => s.id === cita.servicio_id)?.nombre ??
        cita.notas?.trim() ??
        TIPO_LABEL[cita.tipo_cita],
      ya_avisado: cita.recordatorio_enviado,
    })
  }

  // 2. Refuerzos de vacuna y siguientes desparasitaciones. Se descartan si ya
  //    se aplicó una dosis posterior o si el paciente ya tiene la cita puesta:
  //    avisar de algo que ya está resuelto es la forma más rápida de que dejen
  //    de leer los avisos.
  const vacunas = db.get('vacunas_aplicadas')
  for (const vacuna of vacunas) {
    if (!vacuna.fecha_refuerzo) continue
    const paciente = pacienteDe(vacuna.paciente_id)
    if (!paciente) continue
    if (yaSeAplico(vacunas, vacuna.paciente_id, vacuna.fecha_refuerzo, vacuna.nombre_vacuna)) continue
    if (tieneCitaFutura(citas, vacuna.paciente_id, 'vacuna')) continue
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

  const desparasitaciones = db.get('desparasitaciones_aplicadas')
  for (const dosis of desparasitaciones) {
    if (!dosis.fecha_proxima) continue
    const paciente = pacienteDe(dosis.paciente_id)
    if (!paciente) continue
    if (yaSeAplico(desparasitaciones, dosis.paciente_id, dosis.fecha_proxima)) continue
    if (tieneCitaFutura(citas, dosis.paciente_id, 'desparasitacion')) continue
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
  const cobros = db.get('cobros')

  // 3. Seguimiento post-consulta y atenciones sin cobrar
  for (const cita of citas) {
    if (cita.estado !== 'completada') continue
    const dias = diasDeDiferencia(cita.fecha_hora)
    
    // Seguimiento post-consulta (1 a 3 días después)
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
          detalle: servicios.find((s) => s.id === cita.servicio_id)?.nombre ?? TIPO_LABEL[cita.tipo_cita],
          ya_avisado: false,
        })
      }
    }

    // Atención sin cobrar (1 a 7 días después sin registro de cobro)
    if (dias >= -7 && dias <= -1) {
      if (!cobros.some(c => c.cita_id === cita.id)) {
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
  for (const paciente of pacientes) {
    // Cumpleaños
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

    // Inactivos
    const ultimaCita = citas
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

  // Lo vencido primero, y dentro de cada grupo lo más urgente arriba.
  avisos.sort((a, b) => {
    if (a.vencido !== b.vencido) return a.vencido ? -1 : 1
    return a.fecha.localeCompare(b.fecha)
  })

  return delay(avisos)
}

/**
 * El aviso que corresponde a una cita concreta, para poder lanzarlo desde la
 * agenda o desde la ficha del paciente sin pasar por la lista del asistente.
 */
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

/** ¿Hay una dosis igual o posterior a la fecha en que tocaba? Entonces ya se puso. */
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

/** El paciente ya tiene agendado ese procedimiento: el aviso sobra. */
function tieneCitaFutura(citas: Cita[], pacienteId: string, tipo: Cita['tipo_cita']): boolean {
  return citas.some(
    (c) =>
      c.paciente_id === pacienteId &&
      c.tipo_cita === tipo &&
      (c.estado === 'pendiente' || c.estado === 'confirmada') &&
      diasDeDiferencia(c.fecha_hora) >= 0,
  )
}

/**
 * Manda el aviso y deja constancia. La cuota del plan la valida
 * `enviarMensajeWhatsapp`; aquí solo se marca la cita como avisada, que es lo
 * único que el esquema permite actualizar.
 */
export async function enviarAviso(
  clinicaId: string,
  aviso: Programado, 
  mensaje: string, 
  destino: 'cliente' | 'equipo' = 'cliente'
): Promise<string> {
  let numeroDestino = aviso.whatsapp
  if (destino === 'equipo') {
    const clinica = db.get('clinicas')[0]
    if (!clinica?.whatsapp) throw new Error('La clínica no tiene un WhatsApp registrado para recibir avisos internos.')
    numeroDestino = clinica.whatsapp
  }

  const enlace = await enviarMensajeWhatsapp(clinicaId, numeroDestino, mensaje)

  // Solo marcamos como avisado si el mensaje fue para el cliente.
  if (destino === 'cliente' && (aviso.tipo === 'recordatorio_cita' || aviso.tipo === 'preparacion_cirugia')) {
    db.set(
      'citas',
      db.get('citas').map((c) => (c.id === aviso.referencia_id ? { ...c, recordatorio_enviado: true } : c)),
    )
  }
  return enlace
}

/** Lo que el administrador necesita saber del día sin abrir cinco pantallas. */
export async function resumenDelDia(sucursalId?: string): Promise<ResumenDelDia> {
  const hoy = new Date().toISOString()
  const esDeHoy = (iso: string) => formatClinicDate(iso) === formatClinicDate(hoy)

  const citas = db.get('citas').filter((c) => !sucursalId || c.sucursal_id === sucursalId)
  const citasHoy = citas.filter((c) => esDeHoy(c.fecha_hora) && c.estado !== 'cancelada')
  const consentimientos = db.get('consentimientos_cirugia')

  const cirugiasSinConsentimiento = citas.filter(
    (c) =>
      c.tipo_cita === 'cirugia' &&
      (c.estado === 'pendiente' || c.estado === 'confirmada') &&
      diasDeDiferencia(c.fecha_hora) >= 0 &&
      diasDeDiferencia(c.fecha_hora) <= 7 &&
      !consentimientos.some((con) => con.cita_id === c.id),
  ).length

  const avisos = await listProgramados(sucursalId)

  const productos = db
    .get('productos')
    .filter((p) => (!sucursalId || p.sucursal_id === sucursalId) && p.stock_actual <= p.stock_minimo)

  const ingresosHoy = db
    .get('cobros')
    .filter((c) => (!sucursalId || c.sucursal_id === sucursalId) && esDeHoy(c.created_at))
    .reduce((total, c) => total + c.monto_bs, 0)

  return delay({
    fecha: hoy,
    citas_hoy: citasHoy.length,
    sin_confirmar: citasHoy.filter((c) => c.estado === 'pendiente').length,
    cirugias_sin_consentimiento: cirugiasSinConsentimiento,
    refuerzos_vencidos: avisos.filter((a) => a.vencido).length,
    productos_bajo_minimo: productos.map((p) => p.nombre),
    ingresos_hoy_bs: ingresosHoy,
  })
}
