import { supabase } from '../lib/supabase'
import type { Cliente, Especie, Sexo } from '../types/database'
import type {
  FichaPaciente,
  InternacionResumen,
  PacienteConDueno,
  ProductoUsado,
} from '../types/views'
import { consultaOrigenDe } from './citas'
import { detalleDeInternacion, internacionAbiertaDe } from './internacion'
import { diasDeEstadia } from '../lib/internacion'
import { actualizarBorradorHistorial, iniciarConsultaLibre, type CamposEditablesHistorial } from './historial'
import { clinicDayIso, formatClinicDate, fromClinicTime } from '../lib/datetime'

async function internacionActivaDe(pacienteId: string): Promise<InternacionResumen | null> {
  const abierta = await internacionAbiertaDe(pacienteId)
  if (!abierta) return null
  return {
    id: abierta.id,
    fecha_ingreso: abierta.fecha_ingreso,
    dias: diasDeEstadia(abierta.fecha_ingreso, abierta.fecha_alta),
    motivo: abierta.motivo,
    jaula: abierta.jaula,
  }
}

/** Tope de la lista de pacientes. Suficiente para una pantalla, con margen. */
export const LIMITE_PACIENTES = 200

/**
 * Cartera de pacientes, filtrada **en el servidor**.
 *
 * Antes traía todos los pacientes más cuatro tablas completas y la página
 * filtraba en memoria. PostgREST corta en 1000 filas, así que a partir de ahí
 * había pacientes que no se podían encontrar por mucho que se escribiera su
 * nombre: no aparecían y nada avisaba.
 *
 * `busqueda` compara contra el nombre del paciente y el de su dueño. Como son
 * dos tablas, se resuelve en dos pasos: primero los dueños que casan, después
 * los pacientes cuyo nombre casa **o** que pertenecen a esos dueños.
 */
export async function listPacientes(busqueda = '', limite = LIMITE_PACIENTES): Promise<PacienteConDueno[]> {
  const termino = busqueda.trim()
  // `%` y `_` son comodines de LIKE: sin escaparlos, buscar "50%" listaría de más.
  const patron = `%${termino.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

  let query = supabase.from('pacientes').select('*').order('nombre').limit(limite)

  if (termino) {
    const { data: duenosQueCasan } = await supabase
      .from('clientes')
      .select('id')
      .ilike('nombre', patron)
      .limit(limite)

    const idsDuenos = (duenosQueCasan ?? []).map((c) => c.id)
    query = idsDuenos.length
      ? query.or(`nombre.ilike.${patron},cliente_id.in.(${idsDuenos.join(',')})`)
      : query.ilike('nombre', patron)
  }

  const { data: pacientes, error } = await query
  if (error) throw new Error(`No se pudo cargar la lista de pacientes: ${error.message}`)
  if (!pacientes || pacientes.length === 0) return []

  const todayStr = formatClinicDate(new Date().toISOString())
  const pacienteIds = pacientes.map((p: any) => p.id)
  const clienteIds = [...new Set(pacientes.map((p: any) => p.cliente_id).filter(Boolean))]

  // Solo las citas de HOY de estos pacientes: es lo único que la lista pinta.
  const desdeHoy = fromClinicTime(`${clinicDayIso()}T00:00:00`)
  const hastaHoy = fromClinicTime(`${clinicDayIso()}T23:59:59`)

  const [{ data: clientes }, { data: citas }] = await Promise.all([
    supabase.from('clientes').select('*').in('id', clienteIds),
    supabase
      .from('citas')
      .select('*')
      .in('paciente_id', pacienteIds)
      .gte('fecha_hora', desdeHoy)
      .lte('fecha_hora', hastaHoy),
  ])

  const citasDeHoy = citas ?? []
  const veterinarioIds = [...new Set(citasDeHoy.map((c: any) => c.veterinario_id).filter(Boolean))]
  const servicioIds = [...new Set(citasDeHoy.map((c: any) => c.servicio_id).filter(Boolean))]

  const [{ data: usuarios }, { data: servicios }] = await Promise.all([
    veterinarioIds.length
      ? supabase.from('usuarios').select('id, nombre').in('id', veterinarioIds)
      : Promise.resolve({ data: [] as any[] }),
    servicioIds.length
      ? supabase.from('servicios').select('id, nombre').in('id', servicioIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const result = await Promise.all(pacientes.map(async (p: any) => {
    const cliente = clientes?.find((c) => c.id === p.cliente_id) ?? null
    const internacion_activa = await internacionActivaDe(p.id)

    const citas_hoy = await Promise.all(
      citasDeHoy
        .filter((c: any) => c.paciente_id === p.id && formatClinicDate(c.fecha_hora) === todayStr)
        .map(async (c: any) => {
          return {
            ...c,
            paciente: { ...p, cliente, internacion_activa },
            veterinario_nombre: usuarios?.find((u: any) => u.id === c.veterinario_id)?.nombre ?? 'Veterinario',
            servicio_nombre: servicios?.find((s: any) => s.id === c.servicio_id)?.nombre ?? null,
            origen: await consultaOrigenDe(c as any),
          } as any
        })
    )
    citas_hoy.sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))

    return {
      ...p,
      cliente,
      internacion_activa,
      citas_hoy,
    }
  }))

  return result as any
}

export async function getFichaPaciente(pacienteId: string): Promise<FichaPaciente | null> {
  const { data: paciente } = await supabase.from('pacientes').select('*').eq('id', pacienteId).single()
  if (!paciente) return null
  
  const { data: cliente } = await supabase.from('clientes').select('*').eq('id', paciente.cliente_id).single()
  const { data: usuarios } = await supabase.from('usuarios').select('*')
  const { data: vacunas } = await supabase.from('vacunas_aplicadas').select('*').eq('paciente_id', pacienteId)
  const { data: desparasitaciones } = await supabase.from('desparasitaciones_aplicadas').select('*').eq('paciente_id', pacienteId)
  const { data: recetas } = await supabase.from('recetas').select('*').eq('paciente_id', pacienteId)
  const { data: citas } = await supabase.from('citas').select('*').eq('paciente_id', pacienteId)
  const { data: servicios } = await supabase.from('servicios').select('*')
  const { data: internacionesData } = await supabase.from('internaciones').select('*').eq('paciente_id', pacienteId)

  // Los movimientos se acotan a las citas de ESTE paciente, y los productos a
  // los que esos movimientos referencian. Antes se traían las dos tablas
  // enteras —`movimientos_inventario` crece sin techo— para quedarse con un
  // puñado de filas, y por encima de 1000 los consumos de una consulta reciente
  // simplemente no aparecían en su ficha.
  const citaIdsDelPaciente = (citas ?? []).map((c: any) => c.id)
  const { data: movimientos } = citaIdsDelPaciente.length
    ? await supabase.from('movimientos_inventario').select('*').in('cita_id', citaIdsDelPaciente)
    : { data: [] as any[] }

  const productoIds = [...new Set((movimientos ?? []).map((m: any) => m.producto_id).filter(Boolean))]
  const { data: productos } = productoIds.length
    ? await supabase.from('productos').select('*').in('id', productoIds)
    : { data: [] as any[] }
  const { data: consentimientos } = await supabase.from('consentimientos_cirugia').select('*').eq('paciente_id', pacienteId)
  const { data: historialesClinicos } = await supabase.from('historial_clinico').select('*').eq('paciente_id', pacienteId)

  const historiales: any[] = await Promise.all((historialesClinicos || []).map(async (h) => {
    const cita = citas?.find((c) => c.id === h.cita_id)
    const productosUsados: ProductoUsado[] = (movimientos || [])
      .filter((m) => m.cita_id === h.cita_id && m.tipo === 'egreso')
      .map((m) => {
        const producto = productos?.find((p) => p.id === m.producto_id)
        return {
          movimiento_id: m.id,
          producto_id: m.producto_id,
          nombre: producto?.nombre ?? 'Producto',
          cantidad: m.cantidad,
          unidad_medida: producto?.unidad_medida ?? '',
          precio_bs: producto?.precio_bs ?? 0,
        }
      })

    return {
      ...h,
      veterinario_nombre: usuarios?.find((u) => u.id === h.veterinario_id)?.nombre ?? 'Veterinario',
      vacunas: (vacunas || []).filter((v) => v.historial_id === h.id),
      desparasitaciones: (desparasitaciones || []).filter((d) => d.historial_id === h.id),
      productosUsados,
      receta: (recetas || []).filter((r: any) => r.historial_id === h.id),
      tipo_cita: cita?.tipo_cita ?? 'consulta',
      procedimiento: servicios?.find((s) => s.id === cita?.servicio_id)?.nombre ?? null,
      origen: cita ? await consultaOrigenDe(cita as any) : null,
    }
  }))
  historiales.sort((a, b) => b.created_at.localeCompare(a.created_at))

  const internaciones: any[] = await Promise.all((internacionesData || []).map((i) => detalleDeInternacion(i as any)))
  internaciones.sort((a, b) => b.fecha_ingreso.localeCompare(a.fecha_ingreso))

  const internacion_activa = await internacionActivaDe(pacienteId)

  const patientCitas: any[] = await Promise.all((citas || []).map(async (c) => {
    return {
      ...c,
      paciente: { ...paciente, cliente, internacion_activa },
      veterinario_nombre: usuarios?.find((u) => u.id === c.veterinario_id)?.nombre ?? 'Veterinario',
      servicio_nombre: servicios?.find((s) => s.id === c.servicio_id)?.nombre ?? null,
      consentimiento: consentimientos?.find((con) => con.cita_id === c.id) ?? null,
      historial_id: historialesClinicos?.find((h) => h.cita_id === c.id)?.id ?? null,
      origen: await consultaOrigenDe(c as any),
    } as any
  }))
  patientCitas.sort((a, b) => b.fecha_hora.localeCompare(a.fecha_hora))

  return {
    paciente: { ...paciente, cliente: cliente as Cliente, internacion_activa } as any,
    historiales,
    internaciones,
    citas: patientCitas,
    vacunas: (vacunas || []).sort((a, b) => b.fecha_aplicacion.localeCompare(a.fecha_aplicacion)),
    // Ordenadas por cadena `yyyy-mm-dd`: ordena igual que por fecha y no pasa
    // por `new Date()`, que sobre una fecha sola desplaza el día en La Paz.
    desparasitaciones: (desparasitaciones || []).sort((a, b) =>
      b.fecha_aplicacion.localeCompare(a.fecha_aplicacion),
    ),
  } as any
}

export type PrimeraConsultaInput = CamposEditablesHistorial & { motivo: string }

export interface NuevoClientePaciente {
  clienteNombre: string
  clienteWhatsapp: string
  clienteCi: string
  pacienteNombre: string
  especie: Especie
  raza: string
  sexo: Sexo
  foto?: string | null
  fechaNacimiento?: string | null
  alergias?: string | null
  antecedentes?: string | null
  veterinarioId?: string
  sucursalId?: string
  primeraConsulta?: PrimeraConsultaInput
}

export interface AltaPacienteResultado {
  paciente: PacienteConDueno
  historialId: string | null
}

export async function registrarClienteYPaciente(input: NuevoClientePaciente): Promise<AltaPacienteResultado> {
  // 1. Prevenir duplicidad accidental
  const { data: duplicados } = await supabase
    .from('pacientes')
    .select('id, clientes!inner(nombre)')
    .ilike('nombre', input.pacienteNombre.trim())
    .ilike('clientes.nombre', input.clienteNombre.trim())
    .limit(1)

  if (duplicados && duplicados.length > 0) {
    throw new Error(`El paciente "${input.pacienteNombre}" ya está registrado a nombre de "${input.clienteNombre}".`)
  }

  // 2. Registrar cliente
  const { data: cliente, error: cliError } = await supabase
    .from('clientes')
    .insert({
      nombre: input.clienteNombre,
      whatsapp: input.clienteWhatsapp,
      ci: input.clienteCi,
    })
    .select()
    .single()

  if (cliError || !cliente) throw new Error(`Error al registrar cliente: ${cliError?.message || 'desconocido'}`)

  // El `codigo` lo asigna el trigger `trg_codigo_paciente`. Formarlo aquí con
  // `count(*) + 1` era un check-then-act: dos altas simultáneas leían el mismo
  // total y generaban el mismo código.
  const { data: paciente, error: pacError } = await supabase
    .from('pacientes')
    .insert({
      cliente_id: cliente.id,
      nombre: input.pacienteNombre,
      especie: input.especie,
      raza: input.raza,
      sexo: input.sexo,
      foto: input.foto || null,
      fecha_nacimiento: input.fechaNacimiento || null,
      alergias: input.alergias?.trim() || null,
      antecedentes: input.antecedentes?.trim() || null,
    })
    .select()
    .single()

  if (pacError || !paciente) {
    // El cliente ya se insertó: si el paciente falla (CHECK de especie/sexo,
    // colisión del índice de código, RLS) hay que deshacerlo. Sin esto cada
    // reintento dejaba otra ficha de dueño duplicada, y el guardián de
    // duplicados de arriba no las detecta porque solo compara pacientes.
    await supabase.from('clientes').delete().eq('id', cliente.id)
    throw new Error(`Error al registrar paciente: ${pacError?.message || 'desconocido'}`)
  }

  let historialId: string | null = null
  if (input.primeraConsulta && input.veterinarioId && input.sucursalId) {
    const { motivo, ...campos } = input.primeraConsulta
    const historial = await iniciarConsultaLibre(paciente.id, input.sucursalId, input.veterinarioId, motivo)
    await actualizarBorradorHistorial(historial.id, campos)
    historialId = historial.id
  }

  return { paciente: { ...paciente, cliente: cliente as any, internacion_activa: null } as any, historialId }
}

export async function actualizarClienteYPaciente(
  pacienteId: string,
  clienteId: string,
  input: Omit<NuevoClientePaciente, 'primeraConsulta' | 'veterinarioId' | 'sucursalId'>
): Promise<void> {
  const { error: cliError } = await supabase
    .from('clientes')
    .update({
      nombre: input.clienteNombre,
      whatsapp: input.clienteWhatsapp,
      ci: input.clienteCi,
    })
    .eq('id', clienteId)

  if (cliError) throw new Error(`Error al actualizar cliente: ${cliError.message}`)

  const { error: pacError } = await supabase
    .from('pacientes')
    .update({
      nombre: input.pacienteNombre,
      especie: input.especie,
      raza: input.raza,
      sexo: input.sexo,
      foto: input.foto || null,
      fecha_nacimiento: input.fechaNacimiento || null,
      alergias: input.alergias?.trim() || null,
      antecedentes: input.antecedentes?.trim() || null,
    })
    .eq('id', pacienteId)

  if (pacError) throw new Error(`Error al actualizar paciente: ${pacError.message}`)
}

/**
 * Borra un paciente, salvo que tenga dinero cobrado detrás.
 *
 * La cadena de claves foráneas es toda `on delete cascade`
 * (`pacientes` → `citas` → `cobros` → `cobro_lineas`, y lo mismo por
 * `internaciones`), y **los cascades de PostgreSQL no evalúan la RLS**. Así que
 * borrar un paciente se llevaba por delante cobros ya contabilizados en turnos
 * de caja cerrados y arqueados: el arqueo firmado dejaba de cuadrar
 * retroactivamente y las métricas del mes se reescribían solas, sin ningún
 * error por medio.
 *
 * Se comprueba antes en vez de cambiar la cascada porque el resto de la cadena
 * (historial, vacunas, notas) sí debe irse con el paciente; lo que no puede
 * desaparecer es la caja.
 */
export async function eliminarPaciente(pacienteId: string): Promise<void> {
  const { data: citas, error: errorCitas } = await supabase
    .from('citas')
    .select('id')
    .eq('paciente_id', pacienteId)
  if (errorCitas) throw new Error(`No se pudo comprobar el paciente: ${errorCitas.message}`)

  const { data: internaciones, error: errorInt } = await supabase
    .from('internaciones')
    .select('id')
    .eq('paciente_id', pacienteId)
  if (errorInt) throw new Error(`No se pudo comprobar el paciente: ${errorInt.message}`)

  const citaIds = (citas ?? []).map((c) => c.id)
  const internacionIds = (internaciones ?? []).map((i) => i.id)

  if (citaIds.length > 0 || internacionIds.length > 0) {
    let cobrosQuery = supabase.from('cobros').select('id')
    cobrosQuery =
      citaIds.length > 0 && internacionIds.length > 0
        ? cobrosQuery.or(
            `cita_id.in.(${citaIds.join(',')}),internacion_id.in.(${internacionIds.join(',')})`,
          )
        : citaIds.length > 0
          ? cobrosQuery.in('cita_id', citaIds)
          : cobrosQuery.in('internacion_id', internacionIds)

    const { data: cobros, error: errorCobros } = await cobrosQuery
    if (errorCobros) throw new Error(`No se pudo comprobar el paciente: ${errorCobros.message}`)

    if (cobros && cobros.length > 0) {
      throw new Error(
        `Este paciente tiene ${cobros.length} cobro(s) registrados en caja y no se puede eliminar. ` +
          'Borrarlo descuadraría turnos de caja ya cerrados.',
      )
    }
  }

  const { data, error } = await supabase
    .from('pacientes')
    .delete()
    .eq('id', pacienteId)
    .select('id')

  if (error) throw new Error(`Error al eliminar paciente: ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error('No tienes permiso para eliminar este paciente')
  }
}
