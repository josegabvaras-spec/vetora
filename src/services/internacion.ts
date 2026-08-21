import { supabase } from '../lib/supabase'
import type { EstadoInternacion, Internacion, NotaInternacion } from '../types/database'
import type { InternacionConDetalle, NotaInternacionConDetalle, ProductoUsado } from '../types/views'
import { diasDeEstadia } from '../lib/internacion'
import { registrarMovimiento } from './inventario'

/** Lanza si la internación no existe o ya fue dada de alta (expediente cerrado). */
async function exigirInternado(internacionId: string): Promise<Internacion> {
  const { data: internacion } = await supabase.from('internaciones').select('*').eq('id', internacionId).single()
  if (!internacion) throw new Error('Internación no encontrada')
  if (internacion.estado === 'alta') {
    throw new Error('Esta internación ya fue dada de alta y no admite cambios')
  }
  return internacion as Internacion
}

/** Internación en curso del paciente, si la tiene. */
export async function internacionAbiertaDe(pacienteId: string): Promise<Internacion | undefined> {
  const { data } = await supabase.from('internaciones').select('*').eq('paciente_id', pacienteId).eq('estado', 'internado').maybeSingle()
  return (data as any) ?? undefined
}

async function productosDeInternacion(internacionId: string): Promise<ProductoUsado[]> {
  const { data: movimientos } = await supabase
    .from('movimientos_inventario')
    .select('*, producto:productos(*)')
    .eq('internacion_id', internacionId)
    .eq('tipo', 'egreso')

  if (!movimientos) return []

  return movimientos.map((m: any) => ({
    movimiento_id: m.id,
    producto_id: m.producto_id,
    nombre: m.producto?.nombre ?? 'Producto',
    cantidad: m.cantidad,
    precio_bs: m.producto?.precio_bs ?? 0,
  }))
}

export async function detalleDeInternacion(internacion: Internacion): Promise<InternacionConDetalle> {
  const { data: paciente } = await supabase.from('pacientes').select('*, cliente:clientes(*)').eq('id', internacion.paciente_id).single()
  const { data: usuario } = await supabase.from('usuarios').select('*').eq('id', internacion.veterinario_id).single()
  const { data: servicio } = await supabase.from('servicios').select('*').eq('id', internacion.servicio_dia_id).single()
  
  const productosUsados = await productosDeInternacion(internacion.id)
  const dias = diasDeEstadia(internacion.fecha_ingreso, internacion.fecha_alta)

  const { data: notasBrutas } = await supabase
    .from('notas_internacion')
    .select('*, veterinario:usuarios(*)')
    .eq('internacion_id', internacion.id)
    .order('created_at', { ascending: false })

  const notas: NotaInternacionConDetalle[] = (notasBrutas || []).map((n: any) => ({
    ...n,
    veterinario_nombre: n.veterinario?.nombre ?? 'Veterinario',
  }))

  const { data: cobro } = await supabase.from('cobros').select('id').eq('internacion_id', internacion.id).maybeSingle()

  return {
    ...internacion,
    paciente: paciente as any,
    veterinario_nombre: usuario?.nombre ?? 'Veterinario',
    servicio_nombre: servicio?.nombre ?? 'Día de internación',
    notas,
    productosUsados,
    dias,
    costo_estadia_bs: Number((dias * internacion.precio_dia_bs).toFixed(2)),
    costo_productos_bs: Number(
      productosUsados.reduce((n, p) => n + p.precio_bs * p.cantidad, 0).toFixed(2),
    ),
    cobrada: !!cobro,
  }
}

export async function listInternaciones(
  sucursalId?: string,
  estado?: EstadoInternacion,
): Promise<InternacionConDetalle[]> {
  // Tope explícito: `internaciones` crece sin techo y la pantalla solo pinta un
  // listado. Con el orden descendente, lo que se recorta es lo más antiguo, no
  // lo que se está mirando. Sin él, el corte de 1000 filas de PostgREST habría
  // hecho lo mismo pero en silencio y sin garantizar cuál se queda fuera.
  let query = supabase
    .from('internaciones')
    .select('*')
    .order('fecha_ingreso', { ascending: false })
    .limit(500)
  if (sucursalId) query = query.eq('sucursal_id', sucursalId)
  if (estado) query = query.eq('estado', estado)

  const { data: internaciones } = await query
  if (!internaciones || internaciones.length === 0) return []

  return Promise.all(internaciones.map((i: any) => detalleDeInternacion(i)))
}

export async function getInternacion(id: string): Promise<InternacionConDetalle | null> {
  const { data: internacion } = await supabase.from('internaciones').select('*').eq('id', id).maybeSingle()
  if (!internacion) return null
  return detalleDeInternacion(internacion as Internacion)
}

export interface NuevaInternacionInput {
  pacienteId: string
  veterinarioId: string
  sucursalId: string
  motivo: string
  jaula?: string | null
  servicioDiaId: string
  citaId?: string | null
  fechaIngresoIso?: string
}

export async function internarPaciente(input: NuevaInternacionInput): Promise<Internacion> {
  const { data: paciente } = await supabase.from('pacientes').select('id').eq('id', input.pacienteId).single()
  if (!paciente) throw new Error('Paciente no encontrado')
  if (!input.motivo.trim()) throw new Error('Indica el motivo de la internación')

  if (await internacionAbiertaDe(input.pacienteId)) {
    throw new Error('Este paciente ya está internado')
  }

  const { data: servicio } = await supabase.from('servicios').select('*').eq('id', input.servicioDiaId).single()
  if (!servicio || servicio.categoria !== 'internacion') {
    throw new Error('Elige una tarifa de internación del catálogo')
  }
  if (!servicio.activo) throw new Error('Esa tarifa de internación está desactivada')

  const { data, error } = await supabase
    .from('internaciones')
    .insert({
      sucursal_id: input.sucursalId,
      paciente_id: input.pacienteId,
      veterinario_id: input.veterinarioId,
      cita_id: input.citaId ?? null,
      motivo: input.motivo.trim(),
      jaula: input.jaula?.trim() || null,
      fecha_ingreso: input.fechaIngresoIso ?? new Date().toISOString(),
      servicio_dia_id: servicio.id,
      precio_dia_bs: servicio.precio_bs,
      // 'internado' | 'alta' son los únicos que admite el CHECK del esquema.
      estado: 'internado',
    } as any)
    .select()
    .single()

  if (error || !data) throw new Error(`Error al internar: ${error?.message || 'desconocido'}`)
  return data as Internacion
}

export interface NuevaNotaInternacion {
  nota: string
  temperatura_c?: number | null
  frecuencia_cardiaca?: number | null
  frecuencia_respiratoria?: number | null
  peso_kg?: number | null
}

export async function registrarNotaInternacion(
  internacionId: string,
  veterinarioId: string,
  datos: NuevaNotaInternacion,
): Promise<NotaInternacion> {
  await exigirInternado(internacionId)

  const tieneConstantes =
    datos.temperatura_c != null ||
    datos.frecuencia_cardiaca != null ||
    datos.frecuencia_respiratoria != null ||
    datos.peso_kg != null

  const textoNota = datos.nota?.trim() || (tieneConstantes ? 'Registro de constantes vitales' : '')

  if (!textoNota) {
    throw new Error('Escribe la evolución del paciente o registra al menos una constante vital')
  }

  const { data, error } = await supabase
    .from('notas_internacion')
    .insert({
      internacion_id: internacionId,
      veterinario_id: veterinarioId,
      nota: textoNota,
      temperatura_c: datos.temperatura_c ?? null,
      frecuencia_cardiaca: datos.frecuencia_cardiaca ?? null,
      frecuencia_respiratoria: datos.frecuencia_respiratoria ?? null,
      peso_kg: datos.peso_kg ?? null,
    } as any)
    .select()
    .single()

  if (error || !data) throw new Error(`Error al registrar nota: ${error?.message || 'desconocido'}`)
  return data as NotaInternacion
}

export async function registrarProductoInternacion(
  internacionId: string,
  productoId: string,
  cantidad: number,
): Promise<void> {
  const internacion = await exigirInternado(internacionId)
  await registrarMovimiento(productoId, 'egreso', cantidad, `Usado en internación: ${internacion.motivo}`, {
    internacionId: internacion.id,
  })
}

export async function darDeAlta(internacionId: string, indicaciones: string): Promise<Internacion> {
  await exigirInternado(internacionId)

  const { data, error } = await supabase
    .from('internaciones')
    .update({
      estado: 'alta',
      fecha_alta: new Date().toISOString(),
      indicaciones_alta: indicaciones.trim() || null,
    })
    .eq('id', internacionId)
    .select()
    .single()

  if (error || !data) throw new Error(`Error al dar de alta: ${error?.message || 'desconocido'}`)
  return data as Internacion
}
