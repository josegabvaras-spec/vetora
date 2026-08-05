import { db, newId } from '../mocks/db'
import type { Clinica, Plan } from '../types/database'

function delay<T>(value: T): Promise<T> {
  return Promise.resolve(value)
}

export function getPlan(planId: string): Plan | undefined {
  return db.get('planes').find((p) => p.id === planId)
}

export async function listPlanes(soloActivos = false): Promise<Plan[]> {
  const result = db
    .get('planes')
    .filter((p) => !soloActivos || p.activo)
    .sort((a, b) => a.precio_mensual_bs - b.precio_mensual_bs)
  return delay(result)
}

export interface DatosPlan {
  nombre: string
  precio_mensual_bs: number
  whatsapp_limite: number
  max_sucursales: number
  max_usuarios: number
}

function validar(datos: DatosPlan, ignorarId?: string) {
  if (!datos.nombre.trim()) throw new Error('El nombre del plan no puede quedar vacío')
  if (!Number.isFinite(datos.precio_mensual_bs) || datos.precio_mensual_bs < 0) {
    throw new Error('El precio mensual debe ser un número mayor o igual a 0')
  }
  for (const [etiqueta, valor] of [
    ['límite de WhatsApp', datos.whatsapp_limite],
    ['máximo de sucursales', datos.max_sucursales],
    ['máximo de usuarios', datos.max_usuarios],
  ] as const) {
    if (!Number.isInteger(valor) || valor < 1) {
      throw new Error(`El ${etiqueta} debe ser un número entero mayor o igual a 1`)
    }
  }
  const repetido = db
    .get('planes')
    .some((p) => p.id !== ignorarId && p.nombre.trim().toLowerCase() === datos.nombre.trim().toLowerCase())
  if (repetido) throw new Error('Ya existe un plan con ese nombre')
}

export async function crearPlan(datos: DatosPlan): Promise<Plan> {
  validar(datos)
  const plan: Plan = {
    id: newId('plan'),
    nombre: datos.nombre.trim(),
    precio_mensual_bs: datos.precio_mensual_bs,
    whatsapp_limite: datos.whatsapp_limite,
    max_sucursales: datos.max_sucursales,
    max_usuarios: datos.max_usuarios,
    activo: true,
    created_at: new Date().toISOString(),
  }
  db.set('planes', [...db.get('planes'), plan])
  return delay(plan)
}

export async function actualizarPlan(id: string, datos: DatosPlan): Promise<void> {
  if (!getPlan(id)) throw new Error('Plan no encontrado')
  validar(datos, id)
  db.set(
    'planes',
    db.get('planes').map((p) => (p.id === id ? { ...p, ...datos, nombre: datos.nombre.trim() } : p)),
  )
  return delay(undefined)
}

/** Clínicas contratadas en un plan: quien lo usa impide desactivarlo a ciegas. */
export function clinicasEnPlan(planId: string): Clinica[] {
  return db.get('clinicas').filter((c) => c.plan_id === planId)
}

/**
 * Activa o desactiva un plan. Nunca se borra: las clínicas contratadas lo
 * siguen referenciando, y sus límites dependen de él. Desactivarlo solo lo
 * retira de la oferta para nuevas altas.
 */
export async function alternarActivoPlan(id: string): Promise<void> {
  const plan = getPlan(id)
  if (!plan) throw new Error('Plan no encontrado')
  db.set(
    'planes',
    db.get('planes').map((p) => (p.id === id ? { ...p, activo: !p.activo } : p)),
  )
  return delay(undefined)
}
