import { supabase } from '../lib/supabase'
import type {
  PetshopPromocion,
  TipoPromocionPetshop,
  CondicionesPromocion,
} from '../types/database'
import type { ItemCarritoPOS } from '../types/views'

export const TIPO_PROMOCION_LABEL: Record<TipoPromocionPetshop, string> = {
  porcentaje: 'Descuento Porcentual (%)',
  monto_fijo: 'Descuento Fijo (Bs.)',
  dos_por_uno: 'Promoción 2x1',
  combo: 'Combo / Pack de Productos',
  cupon: 'Cupón de Descuento',
}

/**
 * Lista promociones activas o todas las configuradas.
 */
export async function listPromociones(soloActivas = false): Promise<PetshopPromocion[]> {
  let query = supabase
    .from('petshop_promociones')
    .select('*')
    .order('created_at', { ascending: false })

  if (soloActivas) {
    query = query.eq('activo', true)
  }

  const { data, error } = await query
  if (error) throw new Error(`Error al listar promociones: ${error.message}`)

  return (data || []) as unknown as PetshopPromocion[]
}

export interface DatosNuevaPromocion {
  titulo: string
  descripcion?: string
  tipo: TipoPromocionPetshop
  codigoCupon?: string
  valorDescuento: number
  fechaInicio: string
  fechaFin: string
  limiteUso?: number
  condiciones?: CondicionesPromocion
}

/**
 * Crea una nueva promoción o cupón.
 */
export async function crearPromocion(datos: DatosNuevaPromocion): Promise<PetshopPromocion> {
  if (!datos.titulo.trim()) throw new Error('El título de la promoción es obligatorio')
  if (datos.valorDescuento < 0) throw new Error('El valor del descuento no puede ser negativo')

  const { data, error } = await supabase
    .from('petshop_promociones')
    .insert({
      titulo: datos.titulo.trim(),
      descripcion: datos.descripcion?.trim() || '',
      tipo: datos.tipo,
      codigo_cupon: datos.codigoCupon?.trim().toUpperCase() || null,
      valor_descuento: datos.valorDescuento,
      fecha_inicio: datos.fechaInicio,
      fecha_fin: datos.fechaFin,
      activo: true,
      limite_uso: datos.limiteUso || null,
      usos_actuales: 0,
      condiciones: (datos.condiciones || {}) as any,
    })
    .select()
    .single()

  if (error || !data) throw new Error(`Error al crear promoción: ${error?.message || 'desconocido'}`)
  return data as unknown as PetshopPromocion
}

/**
 * Actualiza una promoción.
 */
export async function actualizarPromocion(
  id: string,
  datos: Partial<DatosNuevaPromocion> & { activo?: boolean },
): Promise<void> {
  const payload: any = {}
  if (datos.titulo !== undefined) payload.titulo = datos.titulo.trim()
  if (datos.descripcion !== undefined) payload.descripcion = datos.descripcion.trim()
  if (datos.tipo !== undefined) payload.tipo = datos.tipo
  if (datos.codigoCupon !== undefined) payload.codigo_cupon = datos.codigoCupon.trim().toUpperCase() || null
  if (datos.valorDescuento !== undefined) payload.valor_descuento = datos.valorDescuento
  if (datos.fechaInicio !== undefined) payload.fecha_inicio = datos.fechaInicio
  if (datos.fechaFin !== undefined) payload.fecha_fin = datos.fechaFin
  if (datos.limiteUso !== undefined) payload.limite_uso = datos.limiteUso || null
  if (datos.activo !== undefined) payload.activo = datos.activo
  if (datos.condiciones !== undefined) payload.condiciones = datos.condiciones

  const { error } = await supabase.from('petshop_promociones').update(payload).eq('id', id)
  if (error) throw new Error(`Error al actualizar promoción: ${error.message}`)
}

/**
 * Evalúa las promociones aplicables sobre los artículos del carrito.
 */
export function calcularDescuentoPromocion(
  items: ItemCarritoPOS[],
  promocion: PetshopPromocion,
): { descuentoBs: number; descripcion: string } {
  const subtotal = items.reduce((acc, i) => acc + i.subtotal_bs, 0)
  let descuento = 0

  if (promocion.tipo === 'porcentaje') {
    descuento = (subtotal * promocion.valor_descuento) / 100
  } else if (promocion.tipo === 'monto_fijo' || promocion.tipo === 'cupon') {
    descuento = Math.min(subtotal, promocion.valor_descuento)
  } else if (promocion.tipo === 'dos_por_uno') {
    // 2x1 en productos aplicables
    const prodsIncluidos = promocion.condiciones.productos_incluidos || []
    for (const item of items) {
      if (prodsIncluidos.length === 0 || prodsIncluidos.includes(item.producto.id)) {
        const pares = Math.floor(item.cantidad / 2)
        descuento += pares * item.precio_unitario_bs
      }
    }
  }

  return {
    descuentoBs: Number(descuento.toFixed(2)),
    descripcion: `${promocion.titulo} (-${descuento.toFixed(2)} Bs.)`,
  }
}
