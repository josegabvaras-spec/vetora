import { supabase } from '../lib/supabase'
import type { ModuloVetora, Plan } from '../types/database'

/**
 * El servicio devuelve el tipo de DOMINIO (`types/database.ts`), no la fila
 * generada.
 *
 * En la base, `modulos_habilitados` es `text[]` y el tipo generado lo refleja
 * como `string[]`; el de dominio lo estrecha a `ModuloVetora[]`. Sin convertir
 * aquí, cada consumidor acababa haciendo su propio `as unknown as Plan` —ya
 * había uno en `limitesDe`—, que es justo la señal de que el SQL y los tipos no
 * están alineados. La conversión va UNA vez, en el borde donde la fila cruda se
 * vuelve dominio.
 */
function aPlan(fila: unknown): Plan {
  return fila as Plan
}

/**
 * Devuelve `undefined` solo si el plan no existe.
 *
 * Un fallo de lectura (RLS, red) lanza en vez de devolver `undefined`: quien lo
 * consume lo trataba como «plan sin límites» y acababa enseñando topes de cero
 * que parecían cuota agotada.
 */
export async function getPlan(planId: string): Promise<Plan | undefined> {
  const { data, error } = await supabase.from('planes').select('*').eq('id', planId).maybeSingle()
  if (error) throw new Error(`No se pudo leer el plan: ${error.message}`)
  return data ? aPlan(data) : undefined
}

export async function listPlanes(soloActivos = false): Promise<Plan[]> {
  let query = supabase.from('planes').select('*').order('precio_mensual_usd', { ascending: true })
  if (soloActivos) query = query.eq('activo', true)
  const { data } = await query
  return (data ?? []).map(aPlan)
}

export interface DatosPlan {
  nombre: string
  precio_mensual_usd: number
  whatsapp_limite: number
  max_sucursales: number
  max_usuarios: number
  /**
   * Módulos habilitados para el plan. Controla las secciones de la UI que
   * verá la clínica suscripta. Por defecto incluye todos para veterinarias.
   */
  modulos_habilitados: ModuloVetora[]
  /**
   * Cupo mensual de IA (migración 0039), en dos números separados a
   * propósito: un aviso en Haiku y una pregunta al copiloto en Sonnet
   * cuestan ~19 veces distinto, y contarlos igual dejaba que uno se
   * comiera el cupo del otro. Cero en cualquiera de los dos significa sin
   * esa función, aunque el módulo `asistente_ia` esté marcado arriba.
   */
  ia_limite_redaccion: number
  ia_limite_copiloto: number
}

export async function createPlan(datos: DatosPlan): Promise<Plan> {
  const { data, error } = await supabase.from('planes').insert({
    ...datos,
    activo: true
  }).select().single()

  if (error || !data) throw new Error('Error al crear plan')
  return aPlan(data)
}

export async function updatePlan(id: string, datos: DatosPlan): Promise<Plan> {
  const { data, error } = await supabase.from('planes').update(datos).eq('id', id).select().single()
  if (error || !data) throw new Error('Error al actualizar plan')
  return aPlan(data)
}

export async function setPlanActivo(id: string, activo: boolean): Promise<Plan> {
  if (!activo) {
    const enUso = await usoEnClinicas(id)
    if (enUso > 0) {
      throw new Error('No puedes desactivar este plan porque hay clínicas activas usándolo.')
    }
  }
  const { data, error } = await supabase.from('planes').update({ activo }).eq('id', id).select().single()
  if (error || !data) throw new Error('Error al cambiar estado del plan')
  return aPlan(data)
}

export async function usoEnClinicas(planId: string): Promise<number> {
  const { count, error } = await supabase
    .from('clinicas')
    .select('*', { count: 'exact', head: true })
    .eq('plan_id', planId)
    .neq('estado', 'suspendida')

  // Antes devolvía 0 al fallar, y `setPlanActivo` se fía de ese 0 para permitir
  // la baja: un corte de red retiraba de la oferta un plan con clínicas dentro.
  // Ante la duda hay que lanzar, no asumir que no hay nadie.
  if (error) throw new Error(`No se pudo comprobar el uso del plan: ${error.message}`)
  return count ?? 0
}
