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
  /** `mensaje` lleva el motivo cuando algo va mal: un «caído» sin explicación
   *  obliga a adivinar, que es justo lo que este panel vino a evitar. */
  baseDatos: { estado: EstadoServicio; latenciaMs: number | null; mensaje: string | null }
  almacenamiento: { estado: EstadoServicio; bytesUsados: number | null; mensaje: string | null }
  errores24h: number | null
  erroresMensaje: string | null
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

    if (error) return { estado: 'caido', latenciaMs: null, mensaje: error.message }
    if (latenciaMs > LATENCIA_DEGRADADA_MS) {
      return { estado: 'degradado', latenciaMs, mensaje: `La consulta tardó ${latenciaMs} ms` }
    }
    return { estado: 'operativo', latenciaMs, mensaje: null }
  } catch (err) {
    return { estado: 'caido', latenciaMs: null, mensaje: err instanceof Error ? err.message : String(err) }
  }
}

async function medirAlmacenamiento(): Promise<SaludSistema['almacenamiento']> {
  try {
    // NO se usa `getBucket()`. Lee `storage.buckets`, y 0016 solo creó policies
    // sobre `storage.objects`: fallaba SIEMPRE por permisos y el panel decía
    // «caído» aunque subir y ver imágenes funcionara perfectamente. Estaba
    // midiendo una tabla que la aplicación no usa para nada.
    //
    // `list` sí ejerce lo que la aplicación hace de verdad. Para el superadmin
    // devuelve vacío —sus policies son por clínica y él no tiene ninguna—, y
    // vacío NO es un error: solo lo es que el bucket no exista.
    const { error } = await supabase.storage.from('estudios').list('', { limit: 1 })
    if (error) return { estado: 'caido', bytesUsados: null, mensaje: error.message }

    // El tamaño sale de una función `security definer`, por el mismo motivo:
    // las policies de `storage.objects` acotan por clínica.
    const { data, error: errorEspacio } = await supabase.rpc('espacio_estudios_bytes')
    if (errorEspacio) {
      return {
        estado: 'degradado',
        bytesUsados: null,
        mensaje: `El bucket responde, pero no se pudo medir el espacio: ${errorEspacio.message}`,
      }
    }

    return { estado: 'operativo', bytesUsados: Number(data ?? 0), mensaje: null }
  } catch (err) {
    return { estado: 'caido', bytesUsados: null, mensaje: err instanceof Error ? err.message : String(err) }
  }
}

async function contarErrores24h(): Promise<{ total: number | null; mensaje: string | null }> {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await supabase
    .from('registro_errores')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', desde)

  // `null` y `0` significan cosas distintas: uno es «no se pudo contar» y el
  // otro «no hubo errores». El panel los pinta diferente.
  if (error) return { total: null, mensaje: error.message }
  return { total: count ?? 0, mensaje: null }
}

export async function medirSaludSistema(): Promise<SaludSistema> {
  const [baseDatos, almacenamiento, errores] = await Promise.all([
    medirBaseDatos(),
    medirAlmacenamiento(),
    contarErrores24h(),
  ])
  return { baseDatos, almacenamiento, errores24h: errores.total, erroresMensaje: errores.mensaje }
}

/** Bytes legibles para el panel. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
