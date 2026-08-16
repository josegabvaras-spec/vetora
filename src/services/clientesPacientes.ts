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
import { formatClinicDate } from '../lib/datetime'

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

export async function listPacientes(): Promise<PacienteConDueno[]> {
  const { data: pacientes } = await supabase.from('pacientes').select('*')
  const { data: clientes } = await supabase.from('clientes').select('*')
  const { data: citas } = await supabase.from('citas').select('*')
  const { data: servicios } = await supabase.from('servicios').select('*')
  const { data: usuarios } = await supabase.from('usuarios').select('*')
  
  if (!pacientes) return []
  const todayStr = formatClinicDate(new Date().toISOString())

  const result = await Promise.all(pacientes.map(async (p: any) => {
    const cliente = clientes?.find((c) => c.id === p.cliente_id)!
    const internacion_activa = await internacionActivaDe(p.id)

    const citas_hoy = await Promise.all(
      (citas || [])
        .filter((c) => c.paciente_id === p.id && formatClinicDate(c.fecha_hora) === todayStr)
        .map(async (c) => {
          return {
            ...c,
            paciente: { ...p, cliente, internacion_activa },
            veterinario_nombre: usuarios?.find((u) => u.id === c.veterinario_id)?.nombre ?? 'Veterinario',
            servicio_nombre: servicios?.find((s) => s.id === c.servicio_id)?.nombre ?? null,
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
  const { data: movimientos } = await supabase.from('movimientos_inventario').select('*')
  const { data: productos } = await supabase.from('productos').select('*')
  const { data: recetas } = await (supabase as any).from('recetas').select('*').eq('paciente_id', pacienteId)
  const { data: citas } = await supabase.from('citas').select('*').eq('paciente_id', pacienteId)
  const { data: servicios } = await supabase.from('servicios').select('*')
  const { data: internacionesData } = await supabase.from('internaciones').select('*').eq('paciente_id', pacienteId)
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
  const { data: cliente, error: cliError } = await supabase
    .from('clientes')
    .insert({
      nombre: input.clienteNombre,
      whatsapp: input.clienteWhatsapp,
      ci: input.clienteCi,
    } as any)
    .select()
    .single()

  if (cliError || !cliente) throw new Error(`Error al registrar cliente: ${cliError?.message || 'desconocido'}`)

  const { count } = await supabase.from('pacientes').select('*', { count: 'exact', head: true })
  const codigoAutogenerado = `MAS-${String((count ?? 0) + 1).padStart(3, '0')}`

  const { data: paciente, error: pacError } = await supabase
    .from('pacientes')
    .insert({
      cliente_id: cliente.id,
      codigo: codigoAutogenerado,
      nombre: input.pacienteNombre,
      especie: input.especie,
      raza: input.raza,
      sexo: input.sexo,
      foto: input.foto || null,
      fecha_nacimiento: input.fechaNacimiento || null,
      alergias: input.alergias?.trim() || null,
      antecedentes: input.antecedentes?.trim() || null,
    } as any)
    .select()
    .single()

  if (pacError || !paciente) throw new Error(`Error al registrar paciente: ${pacError?.message || 'desconocido'}`)

  let historialId: string | null = null
  if (input.primeraConsulta && input.veterinarioId && input.sucursalId) {
    const { motivo, ...campos } = input.primeraConsulta
    const historial = await iniciarConsultaLibre(paciente.id, input.sucursalId, input.veterinarioId, motivo)
    await actualizarBorradorHistorial(historial.id, campos)
    historialId = historial.id
  }

  return { paciente: { ...paciente, cliente: cliente as any, internacion_activa: null } as any, historialId }
}
