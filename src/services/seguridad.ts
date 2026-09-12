import { supabase } from '../lib/supabase'
import { traerTodo } from '../lib/paginacion'
import type { EventoSeguridad, SeveridadEvento, TipoEventoSeguridad } from '../types/database'
import type { AnomaliaSeguridad, ResultadoAnalisisSeguridad } from '../types/views'

/**
 * Bitácora de eventos de seguridad (migración `0078`).
 *
 * Es la base sobre la que se apoya cualquier detección posterior: sin una
 * secuencia de eventos registrada no hay nada que una regla —ni un modelo—
 * pueda analizar. Este fichero solo registra y lee; no decide nada.
 *
 * ⚠️ **El actor no se manda desde aquí.** `registrar_evento_seguridad()` es
 * `security definer` y toma `auth.uid()` y `auth_clinica_id()` por su cuenta.
 * Si algún día esta función empieza a pasar un `usuario_id`, la bitácora deja
 * de probar nada: cualquiera con la clave anónima del bundle podría escribir
 * eventos a nombre de otro.
 */

/**
 * Registra un evento. **Nunca lanza, y ese es el punto.**
 *
 * Se llama desde dentro de operaciones reales —iniciar sesión, cambiar un rol,
 * exportar un respaldo—, y ninguna de esas puede fallar porque su bitácora
 * falle. Un evento perdido es malo; un login que no funciona porque no se pudo
 * escribir su evento es peor. La función SQL aplica el mismo criterio por
 * dentro, así que hay dos redes: esta y la suya.
 *
 * No se hace `await` obligatorio en quien la llama: registrar es efecto
 * secundario, no parte de la operación.
 */
export async function registrarEvento(
  tipo: TipoEventoSeguridad,
  opciones: {
    severidad?: SeveridadEvento
    detalle?: Record<string, unknown>
    /**
     * La clínica sobre la que se actuó, cuando no es la del actor — el
     * superadmin no tiene clínica propia pero suspende, borra y respalda
     * clínicas ajenas. Va a `detalle.clinica_afectada`, nunca a la columna
     * `clinica_id`, que es la del actor y la que gobierna la RLS de lectura.
     */
    clinicaAfectada?: string
  } = {},
): Promise<void> {
  try {
    await supabase.rpc('registrar_evento_seguridad', {
      p_tipo: tipo,
      p_severidad: opciones.severidad ?? 'info',
      p_detalle: (opciones.detalle ?? {}) as never,
      p_clinica_afectada: opciones.clinicaAfectada ?? null,
    })
  } catch {
    // Silencio deliberado, ver la cabecera. El fallo tampoco se envía a
    // `registro_errores`: si la base no acepta una fila de bitácora, tampoco
    // va a aceptar la fila que registre que no la aceptó.
  }
}

/**
 * Los últimos eventos que quien pregunta tiene derecho a ver.
 *
 * Quién ve qué lo decide la RLS, no este código: la plataforma ve todo, el
 * `admin` ve lo de su clínica, y el resto del personal no ve nada. Aquí no se
 * filtra por clínica a mano — hacerlo daría la falsa impresión de que ESA es
 * la barrera.
 *
 * `limite` acota de verdad la consulta (no se traen todas las filas para
 * cortarlas después): esta tabla crece con el uso y es justo el tipo de tabla
 * que `CLAUDE.md` señala como impropia para `useTable`.
 */
export async function listEventosSeguridad(limite = 100): Promise<EventoSeguridad[]> {
  const { data, error } = await supabase
    .from('eventos_seguridad')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error) throw new Error(`No se pudieron leer los eventos de seguridad: ${error.message}`)
  return (data ?? []) as EventoSeguridad[]
}

/**
 * Todos los eventos de una ventana de tiempo, paginados.
 *
 * Lo usa el análisis (reglas y, más adelante, el orquestador), que necesita la
 * secuencia completa de la ventana y no una muestra: un patrón de «treinta
 * exportaciones en diez minutos» desaparece si la consulta corta en mil filas
 * sin avisar — el fallo mudo de PostgREST que ya documenta `lib/paginacion.ts`.
 */
export async function eventosDesde(desdeIso: string): Promise<EventoSeguridad[]> {
  return traerTodo<EventoSeguridad>((desde, hasta) =>
    supabase
      .from('eventos_seguridad')
      .select('*')
      .gte('created_at', desdeIso)
      .order('created_at', { ascending: false })
      .range(desde, hasta),
  )
}

/**
 * Corre las reglas determinísticas sobre las últimas `horas` de eventos.
 *
 * Cero anomalías es la respuesta normal, no un fallo — y por eso esto **sí**
 * lanza si la consulta falla, al revés que `registrarEvento()`: ahí un error
 * silencioso solo pierde un registro, pero aquí una lista vacía por un fallo
 * de red se leería como «no hay nada raro», que es la peor mentira que puede
 * decir una pantalla de seguridad. Es el mismo criterio que ya obligó a que
 * `listProgramados` no se tragara sus errores (VUL-41).
 *
 * Quién ve qué lo decide la RLS dentro de la función (`0079`, INVOKER): la
 * plataforma analiza todo, el `admin` solo su clínica.
 */
export async function analizarEventos(horas = 24): Promise<AnomaliaSeguridad[]> {
  const { data, error } = await supabase.rpc('analizar_eventos_seguridad', { p_horas: horas })

  if (error) throw new Error(`No se pudo analizar la seguridad: ${error.message}`)
  return (data ?? []) as AnomaliaSeguridad[]
}

/**
 * Pide el análisis con IA de lo que las reglas hayan marcado (fase 3).
 *
 * ⚠️ **Solo el superadmin.** La Edge Function lo exige, y no es una decisión de
 * pantalla: el gasto en Anthropic lo paga la plataforma y no consume la cuota
 * del plan de ninguna clínica. Un admin no se queda sin nada — `analizarEventos()`
 * de arriba le da las mismas anomalías, gratis y acotadas a su clínica; lo que
 * es solo del operador es la narrativa del modelo.
 *
 * Si no hay anomalías, la función devuelve `motivo: 'sin_anomalias'` **sin
 * llamar al modelo**. Ese corte es lo que hace que esto se pueda ejecutar todos
 * los días sin que cueste nada los días tranquilos, que son casi todos.
 */
export async function analizarConIa(horas = 24): Promise<ResultadoAnalisisSeguridad> {
  const { data, error } = await supabase.functions.invoke<
    ResultadoAnalisisSeguridad & { error?: string }
  >('analisis-seguridad', { body: { horas } })

  // `invoke` da un error genérico ante cualquier 4xx/5xx; el motivo real viene
  // en el cuerpo, así que se prefiere ese (mismo patrón que respaldoPlataforma).
  if (data?.error) throw new Error(data.error)
  if (error) throw new Error(`No se pudo contactar con el análisis de seguridad: ${error.message}`)
  if (!data) throw new Error('El análisis de seguridad no devolvió nada')

  return data
}
