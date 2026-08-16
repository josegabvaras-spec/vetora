import { supabase } from '../lib/supabase'
import type { Database } from '../types/supabase'

type Plan = Database['public']['Tables']['planes']['Row']

export async function getPlan(planId: string): Promise<Plan | undefined> {
  const { data } = await supabase.from('planes').select('*').eq('id', planId).single()
  return data ?? undefined
}

export async function listPlanes(soloActivos = false): Promise<Plan[]> {
  let query = supabase.from('planes').select('*').order('precio_mensual_bs', { ascending: true })
  if (soloActivos) query = query.eq('activo', true)
  const { data } = await query
  return data ?? []
}

export interface DatosPlan {
  nombre: string
  precio_mensual_bs: number
  whatsapp_limite: number
  max_sucursales: number
  max_usuarios: number
}

export async function createPlan(datos: DatosPlan): Promise<Plan> {
  const { data, error } = await supabase.from('planes').insert({
    ...datos,
    activo: true
  }).select().single()

  if (error || !data) throw new Error('Error al crear plan')
  return data
}

export async function updatePlan(id: string, datos: DatosPlan): Promise<Plan> {
  const { data, error } = await supabase.from('planes').update(datos).eq('id', id).select().single()
  if (error || !data) throw new Error('Error al actualizar plan')
  return data
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
  return data
}

export async function usoEnClinicas(planId: string): Promise<number> {
  const { count, error } = await supabase
    .from('clinicas')
    .select('*', { count: 'exact', head: true })
    .eq('plan_id', planId)
    .neq('estado', 'suspendida')
    
  if (error) return 0
  return count ?? 0
}
