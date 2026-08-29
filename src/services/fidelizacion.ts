import { supabase } from '../lib/supabase'
import type { ClienteFidelizacionGrooming } from '../types/views'
import { enlaceWhatsapp } from '../lib/whatsapp'
import { getConfiguracionPeluqueria } from './peluqueria'

/** Carga el análisis de fidelización y recurrencia de clientes de peluquería */
export async function listClientesFidelizacion(sucursalId?: string): Promise<ClienteFidelizacionGrooming[]> {
  let query = supabase
    .from('peluqueria_ordenes')
    .select(`
      *,
      paciente:pacientes(*),
      cliente:clientes(*),
      servicio:servicios(*)
    `)
    .in('estado', ['terminada', 'lista_recoger', 'entregada'])
    .order('created_at', { ascending: false })

  if (sucursalId) query = query.eq('sucursal_id', sucursalId)

  const { data, error } = await query
  if (error) throw new Error(`Error al analizar fidelización: ${error.message}`)

  const config = await getConfiguracionPeluqueria()
  const intervaloDefault = config.intervalo_recordatorio_dias || 30
  const hoy = new Date()

  // Agrupar por paciente_id
  const mapa = new Map<
    string,
    {
      clienteId: string
      clienteNombre: string
      whatsapp: string
      ci: string | null
      pacienteId: string
      pacienteNombre: string
      especie: any
      raza: string | null
      totalVisitas: number
      gastoAcumulado: number
      ultimoServicioFecha: string
      ultimoServicioNombre: string
      serviciosContador: Record<string, number>
    }
  >()

  for (const o of (data || []) as any[]) {
    const pId = o.paciente_id
    if (!pId) continue

    const servNombre = o.servicio?.nombre || 'Peluquería'
    const actual = mapa.get(pId) || {
      clienteId: o.cliente?.id || '',
      clienteNombre: o.cliente?.nombre || 'Cliente',
      whatsapp: o.cliente?.whatsapp || '',
      ci: o.cliente?.ci || null,
      pacienteId: pId,
      pacienteNombre: o.paciente?.nombre || 'Mascota',
      especie: o.paciente?.especie || 'canino',
      raza: o.paciente?.raza || null,
      totalVisitas: 0,
      gastoAcumulado: 0,
      ultimoServicioFecha: o.created_at,
      ultimoServicioNombre: servNombre,
      serviciosContador: {} as Record<string, number>,
    }

    actual.totalVisitas += 1
    actual.gastoAcumulado += Number(o.precio_final_bs) || 0
    actual.serviciosContador[servNombre] = (actual.serviciosContador[servNombre] || 0) + 1

    // La primera iteración es la más reciente por el order
    if (actual.totalVisitas === 1) {
      actual.ultimoServicioFecha = o.created_at
      actual.ultimoServicioNombre = servNombre
    }

    mapa.set(pId, actual)
  }

  const resultado: ClienteFidelizacionGrooming[] = []

  for (const item of mapa.values()) {
    const fechaUltimo = new Date(item.ultimoServicioFecha)
    const diffMs = hoy.getTime() - fechaUltimo.getTime()
    const diasDesde = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))

    // Encontrar servicio más frecuente
    let servicioHabitual = item.ultimoServicioNombre
    let maxVeces = 0
    for (const [sNom, veces] of Object.entries(item.serviciosContador)) {
      if (veces > maxVeces) {
        maxVeces = veces
        servicioHabitual = sNom
      }
    }

    const sugeridoDias = intervaloDefault
    const pendiente = diasDesde >= sugeridoDias

    resultado.push({
      cliente_id: item.clienteId,
      cliente_nombre: item.clienteNombre,
      whatsapp: item.whatsapp,
      ci: item.ci,
      paciente_id: item.pacienteId,
      paciente_nombre: item.pacienteNombre,
      especie: item.especie,
      raza: item.raza,
      total_visitas: item.totalVisitas,
      gasto_acumulado_bs: Number(item.gastoAcumulado.toFixed(2)),
      ultimo_servicio_fecha: item.ultimoServicioFecha,
      ultimo_servicio_nombre: item.ultimoServicioNombre,
      servicio_habitual_nombre: servicioHabitual,
      dias_desde_ultimo_servicio: diasDesde,
      proximo_servicio_sugerido_dias: sugeridoDias,
      recordatorio_pendiente: pendiente,
    })
  }

  // Ordenar: primero los que tienen recordatorio pendiente con más días de inactividad
  return resultado.sort((a, b) => b.dias_desde_ultimo_servicio - a.dias_desde_ultimo_servicio)
}

/** Genera enlace de WhatsApp para recordatorio de visita de grooming */
export function generarEnlaceRecordatorioWhatsApp(
  item: ClienteFidelizacionGrooming,
  clinicaNombre: string,
  plantillaMensaje?: string,
): string {
  const plantilla =
    plantillaMensaje ||
    '¡Hola {dueno}! 🐾 En {clinica} recordamos que ya han pasado {dias} días desde el último servicio de {mascota} ({servicio}). ¿Deseas agendar su cita de spa/peluquería esta semana? ✂️'

  const texto = plantilla
    .replace('{dueno}', item.cliente_nombre.split(' ')[0] || item.cliente_nombre)
    .replace('{clinica}', clinicaNombre)
    .replace('{mascota}', item.paciente_nombre)
    .replace('{dias}', item.dias_desde_ultimo_servicio.toString())
    .replace('{servicio}', item.servicio_habitual_nombre)

  return enlaceWhatsapp(item.whatsapp, texto)
}

/** Genera enlace de WhatsApp avisando que la mascota está lista para recoger */
export function generarEnlaceMascotaListaWhatsApp(
  clienteNombre: string,
  clienteWhatsapp: string,
  pacienteNombre: string,
  clinicaNombre: string,
  plantillaMensaje?: string,
): string {
  const plantilla =
    plantillaMensaje ||
    '¡Hola {dueno}! 🐾 Te avisamos de {clinica} que {mascota} ya está lista y reluciente para que puedas pasar a recogerla. ✨'

  const texto = plantilla
    .replace('{dueno}', clienteNombre.split(' ')[0] || clienteNombre)
    .replace('{clinica}', clinicaNombre)
    .replace('{mascota}', pacienteNombre)

  return enlaceWhatsapp(clienteWhatsapp, texto)
}
