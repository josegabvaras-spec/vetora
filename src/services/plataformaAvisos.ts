import { supabase } from '../lib/supabase'
import { listClinicas, listPagosPendientes } from './plataforma'
import { getConfiguracion } from './configuracion'
import { contarErrores24h } from './salud'
import { ultimasInvitacionesDe } from './invitaciones'
import { clinicDayIso, sumarDias } from '../lib/datetime'
import { estadoDeLaCuenta } from '../lib/acceso'
import { formatBs, formatUsd } from '../lib/currency'
import {
  detalleDeCobro,
  DIAS_AVISO_COBRO,
  UMBRAL_LIMITE,
  type TareaPlataforma,
} from '../lib/asistentePlataforma'
import type { Usuario } from '../types/database'

/**
 * Las tareas se DERIVAN, no se guardan.
 *
 * Igual que `listProgramados` en la clínica: no hay tabla de avisos, se calcula
 * a partir del estado actual. Así una tarea desaparece sola cuando deja de ser
 * cierta —se cobró, se subió de plan— sin que nadie tenga que marcarla.
 */
export async function listTareasPlataforma(): Promise<TareaPlataforma[]> {
  const clinicas = await listClinicas()
  // El tipo de cambio se lee una vez para todas las tareas: es el mismo para
  // todas y pedirlo por clínica serían N viajes para el mismo número.
  const { tipo_cambio_usd } = await getConfiguracion()
  const hoy = clinicDayIso()
  const limite = sumarDias(hoy, DIAS_AVISO_COBRO)
  const tareas: TareaPlataforma[] = []

  for (const c of clinicas) {
    // Las suspendidas no generan tareas: ya están fuera de servicio y avisarles
    // de un cobro o de un tope sería ruido.
    if (c.estado === 'suspendida') continue

    const base = {
      clinica_id: c.id,
      clinica_nombre: c.nombre,
      responsable: c.responsable,
      whatsapp: c.whatsapp,
    }

    // Comparación de días clínicos como cadena. `new Date('2026-08-21')` es
    // medianoche UTC, o sea el 20 a las 20:00 en La Paz: un cobro habría
    // aparecido vencido desde la víspera.
    const vence = c.proximo_cobro.slice(0, 10)

    if (c.estado_pago === 'en_mora' || vence < hoy) {
      tareas.push({
        ...base,
        id: `cobro_vencido-${c.id}`,
        tipo: 'cobro_vencido',
        detalle: detalleDeCobro(c.precio_acordado_usd, tipo_cambio_usd),
        fecha: vence,
        vencido: true,
      })
    } else if (vence <= limite) {
      tareas.push({
        ...base,
        id: `cobro_proximo-${c.id}`,
        tipo: 'cobro_proximo',
        detalle: detalleDeCobro(c.precio_acordado_usd, tipo_cambio_usd),
        fecha: vence,
        vencido: false,
      })
    }

    const apreturas: string[] = []
    for (const [que, { usados, maximo }] of [
      ['sucursales', c.limites.sucursales],
      ['usuarios', c.limites.usuarios],
      ['mensajes de WhatsApp', c.limites.whatsapp],
    ] as const) {
      if (maximo > 0 && usados / maximo >= UMBRAL_LIMITE) {
        apreturas.push(`${usados} de ${maximo} ${que}`)
      }
    }

    if (apreturas.length > 0) {
      tareas.push({
        ...base,
        id: `limite_plan-${c.id}`,
        tipo: 'limite_plan',
        detalle: apreturas.join(', '),
        fecha: null,
        vencido: false,
      })
    }
  }

  // Los comprobantes van fuera del bucle de clínicas: son filas propias, no
  // algo que se deduzca del estado de la clínica. Y van los primeros de la
  // lista por su `vencido: true` — hay dinero esperando a que alguien lo mire.
  for (const p of await listPagosPendientes()) {
    tareas.push({
      id: `comprobante_pendiente-${p.id}`,
      tipo: 'comprobante_pendiente',
      clinica_id: p.clinica_id,
      clinica_nombre: p.clinica_nombre,
      responsable: p.responsable,
      whatsapp: p.whatsapp,
      detalle: `${formatUsd(p.monto_usd)} (${formatBs(p.monto_bs)}) por ${p.meses} ${p.meses === 1 ? 'mes' : 'meses'}`,
      fecha: clinicDayIso(p.created_at),
      vencido: true,
    })
  }

  const { total } = await contarErrores24h()
  if (total && total > 0) {
    tareas.push({
      id: 'errores_sistema',
      tipo: 'errores_sistema',
      clinica_id: null,
      clinica_nombre: 'Plataforma',
      responsable: '',
      whatsapp: '',
      detalle: `${total} ${total === 1 ? 'error registrado' : 'errores registrados'}`,
      fecha: null,
      vencido: true,
    })
  }

  // Vencidas primero; dentro de cada grupo, lo que vence antes.
  return tareas.sort((a, b) => {
    if (a.vencido !== b.vencido) return a.vencido ? -1 : 1
    return (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999')
  })
}

export interface UsuarioSinAcceso {
  usuario: Usuario
  clinica_nombre: string
  estado: string
}

/**
 * Personal dado de alta que todavía no entró al sistema.
 *
 * Es el punto ciego que el panel no enseñaba: hoy solo se ve abriendo cada
 * clínica una por una, y una cuenta creada que nadie canjeó parece operativa
 * desde fuera.
 */
export async function listUsuariosSinAcceso(): Promise<UsuarioSinAcceso[]> {
  const { data: usuarios, error } = await supabase
    .from('usuarios')
    .select('*')
    // El rol `cliente` es del portal y no se da de alta por invitación.
    .in('rol', ['admin', 'veterinario', 'recepcion'])
    .order('created_at', { ascending: false })

  if (error) throw new Error(`No se pudieron cargar los usuarios: ${error.message}`)
  if (!usuarios || usuarios.length === 0) return []

  const { data: clinicas } = await supabase.from('clinicas').select('id, nombre')
  const nombrePorClinica = new Map((clinicas ?? []).map((c) => [c.id, c.nombre]))

  // Una sola consulta para todas las invitaciones, no una por usuario.
  const invitaciones = await ultimasInvitacionesDe(usuarios.map((u) => u.id))

  return (usuarios as Usuario[])
    .map((usuario) => ({
      usuario,
      clinica_nombre: nombrePorClinica.get(usuario.clinica_id ?? '') ?? 'Sin clínica',
      ...estadoDeLaCuenta(invitaciones.get(usuario.id)),
    }))
    .filter((fila) => !fila.activa)
    .map(({ usuario, clinica_nombre, texto }) => ({ usuario, clinica_nombre, estado: texto }))
}
