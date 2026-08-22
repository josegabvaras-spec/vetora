import { supabase } from '../lib/supabase'

/**
 * Salud del sistema, medida en el momento de pedirla.
 *
 * Sustituye a los literales que había en `plataforma.ts`. Lo que se mide y lo
 * que se dejó fuera:
 *
 * · **Base de datos**: latencia real de una consulta mínima.
 * · **Almacenamiento**: se pide el bucket y se suma lo que ocupa.
 * · **Errores**: filas de `registro_errores` en las últimas 24 h (0018).
 * · **API de WhatsApp**: eliminada. No existe — `lib/whatsapp.ts` compone un
 *   enlace `wa.me` que abre una persona desde su teléfono.
 * · **Uptime**: eliminado. Una aplicación no puede medir su propio tiempo en
 *   línea: solo puede informar mientras está funcionando, así que el número
 *   siempre habría sido inventado.
 */

export type EstadoServicio = 'operativo' | 'degradado' | 'caido'

export interface SaludSistema {
  baseDatos: { estado: EstadoServicio; latenciaMs: number | null }
  almacenamiento: { estado: EstadoServicio; bytesUsados: number | null }
  errores24h: number | null
}

/**
 * Por encima de esto la base responde, pero mal. El corte es generoso a
 * propósito: Supabase es un servicio remoto y desde Bolivia el viaje de ida y
 * vuelta ya cuesta unos cientos de milisegundos en un día normal.
 */
const LATENCIA_DEGRADADA_MS = 1500

async function medirBaseDatos(): Promise<SaludSistema['baseDatos']> {
  const inicio = performance.now()
  try {
    // `planes` es la tabla más pequeña y su policy de lectura es `using (true)`,
    // así que la medición no depende del rol de quien pregunta. `head: true` no
    // trae filas: se mide el viaje, no el volumen.
    const { error } = await supabase.from('planes').select('id', { count: 'exact', head: true })
    const latenciaMs = Math.round(performance.now() - inicio)

    if (error) return { estado: 'caido', latenciaMs: null }
    return { estado: latenciaMs > LATENCIA_DEGRADADA_MS ? 'degradado' : 'operativo', latenciaMs }
  } catch {
    return { estado: 'caido', latenciaMs: null }
  }
}

async function medirAlmacenamiento(): Promise<SaludSistema['almacenamiento']> {
  try {
    // Si el bucket no existe —la migración 0016 sin aplicar— esto falla, que es
    // exactamente lo que el panel debe enseñar en vez de un «operativo» fijo.
    const { error } = await supabase.storage.getBucket('estudios')
    if (error) return { estado: 'caido', bytesUsados: null }

    // El tamaño sale de una función `security definer`: las policies de
    // `storage.objects` acotan por clínica y el superadmin no tiene ninguna.
    const { data, error: errorEspacio } = await supabase.rpc('espacio_estudios_bytes')
    if (errorEspacio) return { estado: 'degradado', bytesUsados: null }

    return { estado: 'operativo', bytesUsados: Number(data ?? 0) }
  } catch {
    return { estado: 'caido', bytesUsados: null }
  }
}

async function contarErrores24h(): Promise<number | null> {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await supabase
    .from('registro_errores')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', desde)

  // `null` y `0` significan cosas distintas: uno es «no se pudo contar» y el
  // otro «no hubo errores». El panel los pinta diferente.
  if (error) return null
  return count ?? 0
}

export async function medirSaludSistema(): Promise<SaludSistema> {
  const [baseDatos, almacenamiento, errores24h] = await Promise.all([
    medirBaseDatos(),
    medirAlmacenamiento(),
    contarErrores24h(),
  ])
  return { baseDatos, almacenamiento, errores24h }
}

/** Bytes legibles para el panel. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
