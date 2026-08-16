import { db, newId } from '../mocks/db'
import type { Cliente, Especie, Paciente, Sexo } from '../types/database'
import type {
  CitaConDetalle,
  FichaPaciente,
  HistorialConDetalle,
  InternacionConDetalle,
  InternacionResumen,
  PacienteConDueno,
  ProductoUsado,
} from '../types/views'
import { consultaOrigenDe } from './citas'
import { detalleDeInternacion, internacionAbiertaDe } from './internacion'
import { diasDeEstadia } from '../lib/internacion'
import { actualizarBorradorHistorial, iniciarConsultaLibre, type CamposEditablesHistorial } from './historial'
import { formatClinicDate } from '../lib/datetime'

function delay<T>(value: T): Promise<T> {
  return Promise.resolve(value)
}

/**
 * Estadía abierta del paciente, resumida. Se adjunta al paciente para que la
 * hospitalización se vea allá donde se lo consulte (listado y ficha), sin tener
 * que entrar a la sala de internación.
 */
function internacionActivaDe(pacienteId: string): InternacionResumen | null {
  const abierta = internacionAbiertaDe(pacienteId)
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
  const pacientes = db.get('pacientes')
  const clientes = db.get('clientes')
  const citas = db.get('citas')
  const servicios = db.get('servicios')
  const usuarios = db.get('usuarios')
  const todayStr = formatClinicDate(new Date().toISOString())

  const result = pacientes.map((p) => {
    const cliente = clientes.find((c) => c.id === p.cliente_id)!
    const internacion_activa = internacionActivaDe(p.id)

    // Filtramos las citas de hoy para este paciente
    const citas_hoy = citas
      .filter((c) => c.paciente_id === p.id && formatClinicDate(c.fecha_hora) === todayStr)
      .map((c) => {
        return {
          ...c,
          paciente: { ...p, cliente, internacion_activa },
          veterinario_nombre: usuarios.find((u) => u.id === c.veterinario_id)?.nombre ?? 'Veterinario',
          servicio_nombre: servicios.find((s) => s.id === c.servicio_id)?.nombre ?? null,
        } as CitaConDetalle
      })
      .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))

    return {
      ...p,
      cliente,
      internacion_activa,
      citas_hoy,
    }
  })
  return delay(result)
}

export async function getFichaPaciente(pacienteId: string): Promise<FichaPaciente | null> {
  const paciente = db.get('pacientes').find((p) => p.id === pacienteId)
  if (!paciente) return delay(null)
  const cliente = db.get('clientes').find((c) => c.id === paciente.cliente_id)!
  const usuarios = db.get('usuarios')
  const vacunas = db.get('vacunas_aplicadas')
  const desparasitaciones = db.get('desparasitaciones_aplicadas')
  const movimientos = db.get('movimientos_inventario')
  const productos = db.get('productos')
  const recetas = db.get('recetas')

  const citas = db.get('citas')
  const servicios = db.get('servicios')

  const historiales: HistorialConDetalle[] = db
    .get('historial_clinico')
    .filter((h) => h.paciente_id === pacienteId)
    .map((h) => {
      const cita = citas.find((c) => c.id === h.cita_id)
      // Los productos consumidos se rastrean por la cita de la consulta
      // (movimientos_inventario.cita_id), no requieren tabla propia.
      const productosUsados: ProductoUsado[] = movimientos
        .filter((m) => m.cita_id === h.cita_id && m.tipo === 'egreso')
        .map((m) => {
          const producto = productos.find((p) => p.id === m.producto_id)
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
        veterinario_nombre: usuarios.find((u) => u.id === h.veterinario_id)?.nombre ?? 'Veterinario',
        vacunas: vacunas.filter((v) => v.historial_id === h.id),
        desparasitaciones: desparasitaciones.filter((d) => d.historial_id === h.id),
        productosUsados,
        receta: recetas.filter((r) => r.historial_id === h.id),
        tipo_cita: cita?.tipo_cita ?? 'consulta',
        procedimiento: servicios.find((s) => s.id === cita?.servicio_id)?.nombre ?? null,
        origen: cita ? consultaOrigenDe(cita) : null,
      }
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  // Una estadía es un episodio clínico más: las cerradas quedan en el
  // historial, no solo en la sala de internación.
  const internaciones: InternacionConDetalle[] = db
    .get('internaciones')
    .filter((i) => i.paciente_id === pacienteId)
    .map(detalleDeInternacion)
    .sort((a, b) => b.fecha_ingreso.localeCompare(a.fecha_ingreso))

  const consentimientos = db.get('consentimientos_cirugia')
  const historialesClinicos = db.get('historial_clinico')

  const patientCitas = citas
    .filter((c) => c.paciente_id === pacienteId)
    .map((c) => {
      return {
        ...c,
        paciente: { ...paciente, cliente, internacion_activa: internacionActivaDe(pacienteId) },
        veterinario_nombre: usuarios.find((u) => u.id === c.veterinario_id)?.nombre ?? 'Veterinario',
        servicio_nombre: servicios.find((s) => s.id === c.servicio_id)?.nombre ?? null,
        consentimiento: consentimientos.find((con) => con.cita_id === c.id) ?? null,
        historial_id: historialesClinicos.find((h) => h.cita_id === c.id)?.id ?? null,
        origen: consultaOrigenDe(c),
      } as CitaConDetalle
    })
    .sort((a, b) => b.fecha_hora.localeCompare(a.fecha_hora))

  return delay({
    paciente: { ...paciente, cliente, internacion_activa: internacionActivaDe(pacienteId) },
    historiales,
    internaciones,
    citas: patientCitas,
    vacunas: vacunas.filter(v => v.paciente_id === pacienteId).sort((a, b) => b.fecha_aplicacion.localeCompare(a.fecha_aplicacion)),
  })
}

/**
 * Primera consulta opcional que puede abrirse en el mismo acto del alta.
 * Es la misma ficha clínica que se llena al editar una consulta: el motivo es
 * obligatorio y el resto (anamnesis y examen físico) es opcional.
 */
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
  /** Requeridos solo si se abre la primera consulta. */
  veterinarioId?: string
  sucursalId?: string
  primeraConsulta?: PrimeraConsultaInput
}

export interface AltaPacienteResultado {
  paciente: PacienteConDueno
  /** Id del historial creado, si el alta incluyó una primera consulta. */
  historialId: string | null
}

export async function registrarClienteYPaciente(input: NuevoClientePaciente): Promise<AltaPacienteResultado> {
  const cliente: Cliente = {
    id: newId('cliente'),
    clinica_id: db.clinicaActivaId(),
    nombre: input.clienteNombre,
    whatsapp: input.clienteWhatsapp,
    ci: input.clienteCi,
    created_at: new Date().toISOString(),
  }
  db.set('clientes', [...db.get('clientes'), cliente])

  const cantidadPacientes = db.get('pacientes').filter(p => p.clinica_id === db.clinicaActivaId()).length
  const codigoAutogenerado = `MAS-${String(cantidadPacientes + 1).padStart(3, '0')}`

  const paciente: Paciente = {
    id: newId('paciente'),
    clinica_id: db.clinicaActivaId(),
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
    created_at: new Date().toISOString(),
  }
  db.set('pacientes', [...db.get('pacientes'), paciente])

  let historialId: string | null = null
  if (input.primeraConsulta && input.veterinarioId && input.sucursalId) {
    const { motivo, ...campos } = input.primeraConsulta
    // Reutiliza el flujo de consulta espontánea: crea la cita de respaldo que
    // exige historial_clinico.cita_id y deja el historial como borrador.
    const historial = await iniciarConsultaLibre(paciente.id, input.sucursalId, input.veterinarioId, motivo)
    await actualizarBorradorHistorial(historial.id, campos)
    historialId = historial.id
  }

  return delay({ paciente: { ...paciente, cliente }, historialId })
}
