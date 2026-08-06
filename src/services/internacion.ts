import { db, newId } from '../mocks/db'
import type { EstadoInternacion, Internacion, NotaInternacion } from '../types/database'
import type { InternacionConDetalle, NotaInternacionConDetalle, ProductoUsado } from '../types/views'
import { diasDeEstadia } from '../lib/internacion'
import { registrarMovimiento } from './inventario'

function delay<T>(value: T): Promise<T> {
  return Promise.resolve(value)
}

/** Lanza si la internación no existe o ya fue dada de alta (expediente cerrado). */
function exigirInternado(internacionId: string): Internacion {
  const internacion = db.get('internaciones').find((i) => i.id === internacionId)
  if (!internacion) throw new Error('Internación no encontrada')
  if (internacion.estado === 'alta') {
    throw new Error('Esta internación ya fue dada de alta y no admite cambios')
  }
  return internacion
}

/** Internación en curso del paciente, si la tiene. */
export function internacionAbiertaDe(pacienteId: string): Internacion | undefined {
  return db.get('internaciones').find((i) => i.paciente_id === pacienteId && i.estado === 'internado')
}

function productosDeInternacion(internacionId: string): ProductoUsado[] {
  const productos = db.get('productos')
  return db
    .get('movimientos_inventario')
    .filter((m) => m.internacion_id === internacionId && m.tipo === 'egreso')
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
}

export function detalleDeInternacion(internacion: Internacion): InternacionConDetalle {
  const paciente = db.get('pacientes').find((p) => p.id === internacion.paciente_id)!
  const cliente = db.get('clientes').find((c) => c.id === paciente.cliente_id)!
  const usuarios = db.get('usuarios')
  const productosUsados = productosDeInternacion(internacion.id)
  const dias = diasDeEstadia(internacion.fecha_ingreso, internacion.fecha_alta)

  const notas: NotaInternacionConDetalle[] = db
    .get('notas_internacion')
    .filter((n) => n.internacion_id === internacion.id)
    .map((n) => ({
      ...n,
      veterinario_nombre: usuarios.find((u) => u.id === n.veterinario_id)?.nombre ?? 'Veterinario',
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  return {
    ...internacion,
    paciente: { ...paciente, cliente },
    veterinario_nombre: usuarios.find((u) => u.id === internacion.veterinario_id)?.nombre ?? 'Veterinario',
    servicio_nombre:
      db.get('servicios').find((s) => s.id === internacion.servicio_dia_id)?.nombre ?? 'Día de internación',
    notas,
    productosUsados,
    dias,
    costo_estadia_bs: Number((dias * internacion.precio_dia_bs).toFixed(2)),
    costo_productos_bs: Number(
      productosUsados.reduce((n, p) => n + p.precio_bs * p.cantidad, 0).toFixed(2),
    ),
    cobrada: db.get('cobros').some((c) => c.internacion_id === internacion.id),
  }
}

export async function listInternaciones(
  sucursalId?: string,
  estado?: EstadoInternacion,
): Promise<InternacionConDetalle[]> {
  const result = db
    .get('internaciones')
    .filter((i) => !sucursalId || i.sucursal_id === sucursalId)
    .filter((i) => !estado || i.estado === estado)
    .map(detalleDeInternacion)
    .sort((a, b) => b.fecha_ingreso.localeCompare(a.fecha_ingreso))
  return delay(result)
}

export async function getInternacion(id: string): Promise<InternacionConDetalle | null> {
  const internacion = db.get('internaciones').find((i) => i.id === id)
  return delay(internacion ? detalleDeInternacion(internacion) : null)
}

export interface NuevaInternacionInput {
  pacienteId: string
  veterinarioId: string
  sucursalId: string
  motivo: string
  jaula?: string | null
  /** Servicio del catálogo de categoría "internación": fija el precio por día. */
  servicioDiaId: string
  citaId?: string | null
  fechaIngresoIso?: string
}

export async function internarPaciente(input: NuevaInternacionInput): Promise<Internacion> {
  if (!db.get('pacientes').some((p) => p.id === input.pacienteId)) {
    throw new Error('Paciente no encontrado')
  }
  if (!input.motivo.trim()) throw new Error('Indica el motivo de la internación')

  // Un paciente no puede estar internado dos veces a la vez: el segundo ingreso
  // duplicaría los días de estadía facturados.
  if (internacionAbiertaDe(input.pacienteId)) {
    throw new Error('Este paciente ya está internado')
  }

  const servicio = db.get('servicios').find((s) => s.id === input.servicioDiaId)
  if (!servicio || servicio.categoria !== 'internacion') {
    throw new Error('Elige una tarifa de internación del catálogo')
  }
  if (!servicio.activo) throw new Error('Esa tarifa de internación está desactivada')

  const internacion: Internacion = {
    id: newId('internacion'),
    clinica_id: db.clinicaActivaId(),
    sucursal_id: input.sucursalId,
    paciente_id: input.pacienteId,
    veterinario_id: input.veterinarioId,
    cita_id: input.citaId ?? null,
    motivo: input.motivo.trim(),
    jaula: input.jaula?.trim() || null,
    fecha_ingreso: input.fechaIngresoIso ?? new Date().toISOString(),
    fecha_alta: null,
    servicio_dia_id: servicio.id,
    // Congelado al ingreso, como las líneas de cobro: subir la tarifa mañana no
    // debe encarecer retroactivamente una estadía que ya empezó.
    precio_dia_bs: servicio.precio_bs,
    indicaciones_alta: null,
    estado: 'internado',
    created_at: new Date().toISOString(),
  }
  db.set('internaciones', [...db.get('internaciones'), internacion])
  return delay(internacion)
}

export interface NuevaNotaInternacion {
  nota: string
  temperatura_c?: number | null
  frecuencia_cardiaca?: number | null
  frecuencia_respiratoria?: number | null
  peso_kg?: number | null
}

/**
 * Evolución diaria. Es solo INSERT: igual que el historial cerrado, una nota
 * escrita no se corrige, se escribe otra.
 */
export async function registrarNotaInternacion(
  internacionId: string,
  veterinarioId: string,
  datos: NuevaNotaInternacion,
): Promise<NotaInternacion> {
  exigirInternado(internacionId)

  const tieneConstantes =
    datos.temperatura_c != null ||
    datos.frecuencia_cardiaca != null ||
    datos.frecuencia_respiratoria != null ||
    datos.peso_kg != null

  const textoNota = datos.nota?.trim() || (tieneConstantes ? 'Registro de constantes vitales' : '')

  if (!textoNota) {
    throw new Error('Escribe la evolución del paciente o registra al menos una constante vital')
  }

  const nota: NotaInternacion = {
    id: newId('nota-internacion'),
    clinica_id: db.clinicaActivaId(),
    internacion_id: internacionId,
    veterinario_id: veterinarioId || db.get('usuarios')[0]?.id || 'vet-1',
    nota: textoNota,
    temperatura_c: datos.temperatura_c ?? null,
    frecuencia_cardiaca: datos.frecuencia_cardiaca ?? null,
    frecuencia_respiratoria: datos.frecuencia_respiratoria ?? null,
    peso_kg: datos.peso_kg ?? null,
    created_at: new Date().toISOString(),
  }
  db.set('notas_internacion', [...db.get('notas_internacion'), nota])
  return delay(nota)
}

/** Descuenta del inventario un producto usado durante la estadía (HU-03 sigue aplicando). */
export async function registrarProductoInternacion(
  internacionId: string,
  productoId: string,
  cantidad: number,
): Promise<void> {
  const internacion = exigirInternado(internacionId)
  await registrarMovimiento(productoId, 'egreso', cantidad, `Usado en internación: ${internacion.motivo}`, {
    internacionId: internacion.id,
  })
}

/**
 * Cierra la estadía. A partir del alta la internación queda inmutable y pasa a
 * la lista de pendientes de cobro de caja.
 */
export async function darDeAlta(internacionId: string, indicaciones: string): Promise<Internacion> {
  const internacion = exigirInternado(internacionId)

  const cerrada: Internacion = {
    ...internacion,
    estado: 'alta',
    fecha_alta: new Date().toISOString(),
    indicaciones_alta: indicaciones.trim() || null,
  }
  db.set(
    'internaciones',
    db.get('internaciones').map((i) => (i.id === internacionId ? cerrada : i)),
  )
  return delay(cerrada)
}
