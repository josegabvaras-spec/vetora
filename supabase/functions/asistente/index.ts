// Asistente de avisos (PRD Épica 4). Redacta el mensaje de WhatsApp de un
// aviso, o el resumen del día para el administrador.
//
// Corre en el servidor y no en el navegador por una sola razón: la clave de
// Anthropic. Cualquier variable `VITE_*` acaba dentro del bundle que se
// descarga el cliente, así que una clave puesta ahí es una clave regalada.
//
// ⚠️ **DOS CLIENTES DE SUPABASE, Y NO SE PUEDEN CONFUNDIR.**
//
//   · `admin`        — `service_role`. **Solo** para saber QUIÉN llama: validar
//                      el JWT y leer su fila de `usuarios` y su plan. La RLS no
//                      le aplica, y por eso no puede tocar datos de negocio.
//   · `comoUsuario`  — el JWT de quien llama, uno por petición. Para **todo lo
//                      demás**: la cuota y la bitácora hoy, y las herramientas
//                      del copiloto cuando existan.
//
// Con `comoUsuario`, una consulta lee exactamente lo que ese usuario lee desde
// el navegador: mismas policies, mismo `auth_clinica_id()`. El aislamiento entre
// clínicas sigue siendo la RLS y no un `where` escrito a mano. Usar `admin` para
// leer datos de negocio sería el fallo más grave posible del proyecto: dejaría
// el aislamiento multi-inquilino colgando de que ninguna consulta se equivoque.
//
// Desplegar:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy asistente
// Probar en local:
//   supabase functions serve asistente --env-file supabase/functions/.env.local

import Anthropic from 'npm:@anthropic-ai/sdk@^0.68.0'
import { createClient } from 'npm:@supabase/supabase-js@^2.58.0'
import {
  ESFUERZO_POR_TAREA,
  MAX_TOKENS_POR_TAREA,
  MODELO_POR_TAREA,
  costoEstimadoUsd,
  esTarea,
  soportaEffort,
  totalDeEntrada,
  type Tarea,
  type TokensDeEntrada,
} from './modelos.ts'
import { orquestar } from './orquestador.ts'

const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!
const CLAVE_ANONIMA = Deno.env.get('SUPABASE_ANON_KEY')!

// Solo para comprobar quién llama. Ver la advertencia de la cabecera.
const admin = createClient(URL_SUPABASE, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * El cliente con el que se consulta cualquier cosa que no sea autorización.
 *
 * Lleva el token de quien llamó, así que PostgREST le aplica sus policies tal
 * cual. `consumir_cuota_ia()` lo necesita —es `security definer` y resuelve la
 * clínica con `auth_clinica_id()`—, y la bitácora también: su policy de INSERT
 * comprueba que `clinica_id` sea la de la sesión.
 */
function clienteDeUsuario(jwt: string) {
  return createClient(URL_SUPABASE, CLAVE_ANONIMA, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

const INSTRUCCIONES = `Eres quien escribe los mensajes de WhatsApp de una clínica veterinaria de Bolivia.

Escribe en español de Bolivia, tratando de "usted" al dueño de la mascota.

Reglas:
- Un solo mensaje, de 2 a 4 frases. Nada de asuntos, encabezados ni firmas: la clínica ya se identifica sola.
- Empieza saludando por su nombre y nombra a la mascota. Es su animal, no "su paciente".
- Di con claridad qué toca, cuándo, y qué tiene que hacer la persona.
- Sin emojis, sin mayúsculas de énfasis, sin signos de exclamación repetidos.
- No inventes precios, horarios de atención, direcciones ni indicaciones clínicas que no estén en los datos.
- Si el aviso está vencido, dilo sin alarmismo ni reproche.
- En una preparación de cirugía, las únicas indicaciones que puedes dar son el ayuno y llevar al animal sujeto.

Devuelve solo el texto del mensaje, listo para enviar.`

// El aviso interno lo lee el equipo de la clínica, no el dueño de la mascota.
// Sin estas instrucciones propias, la tarea `aviso_interno` caía en un 400 y
// jamás llegaba al modelo: el equipo recibía siempre la plantilla, y la insignia
// decía «Plantilla del sistema» sin que nadie supiera que ahí la IA era
// inalcanzable por diseño y no por falta de configuración.
const INSTRUCCIONES_INTERNAS = `Eres quien escribe las notas internas del equipo de una clínica veterinaria de Bolivia.

Escribe en español de Bolivia, dirigiéndote al equipo de la clínica, no al dueño de la mascota.

Reglas:
- Un solo mensaje, de 1 a 3 frases. Es una nota de trabajo, no una carta.
- Nombra a la mascota y, entre paréntesis, a su dueño. Di qué hay que hacer y para cuándo.
- Tono de aviso operativo: directo, sin saludos ni despedidas.
- Sin emojis y sin signos de exclamación.
- No inventes datos clínicos, precios ni horarios que no estén en los datos.
- No redactes el mensaje para el cliente: esto es lo que el equipo tiene que saber.

Devuelve solo el texto de la nota.`

const INSTRUCCIONES_INFORME = `Eres el asistente del administrador de una clínica veterinaria de Bolivia.

Resume el día en 3 a 5 líneas, en español, para que lo lea de un vistazo en el celular.

Reglas:
- Empieza por lo que exige una decisión hoy: consentimientos que faltan, refuerzos vencidos, stock por debajo del mínimo.
- Cifras exactas, tal como vienen en los datos. No estimes ni redondees.
- Sin emojis ni signos de exclamación. Si no hay nada urgente, dilo en una línea y termina.`

const INSTRUCCIONES_POR_TAREA: Record<Tarea, string> = {
  aviso: INSTRUCCIONES,
  aviso_interno: INSTRUCCIONES_INTERNAS,
  informe: INSTRUCCIONES_INFORME,
  // El copiloto llega en la fase 3; hasta entonces su tarea se rechaza abajo.
  copiloto: '',
}

const ESQUEMA = {
  type: 'object',
  properties: {
    texto: {
      type: 'string',
      description: 'El mensaje listo para enviar, sin comillas ni prefijos.',
    },
  },
  required: ['texto'],
  additionalProperties: false,
}

/**
 * Los dos parámetros que la API acepta y el SDK **0.68 todavía no declara**:
 *
 *   · `fallbacks` — acompaña al beta `server-side-fallback`. Un rechazo del
 *     clasificador no puede dejar sin avisar a un cliente.
 *   · `output_config` — el esfuerzo de razonamiento y la salida estructurada
 *     con esquema.
 *
 * Van agrupados aquí, fuera del literal de la llamada, y no por gusto: dentro
 * del literal, TypeScript rechaza **la llamada entera** por propiedad
 * desconocida, y entonces `deno check` deja de servir para nada. Acotado así, el
 * cast tapa exactamente estos dos y la comprobación sigue cubriendo el resto —
 * que importa, porque `supabase/` no entra en `tsc -b` y este es el único
 * chequeo estático que tiene la función.
 *
 * ⚠️ Es deuda del SDK, no del código: la versión fijada va por detrás de las
 * funciones de la API que aquí se usan. Cuando se suba el pin y las declare,
 * esto se borra y los dos vuelven al literal.
 *
 * ⚠️ **`effort` no es universal.** Desde que las tareas de redacción bajaron a
 * Haiku 4.5 —que no admite `output_config.effort` y lo rechaza con error—,
 * mandarlo a ciegas para cualquier modelo rompería esas tres tareas. Por eso
 * recibe el modelo y consulta `soportaEffort()` antes de incluirlo.
 */
function parametrosNoDeclaradosPorElSdk(modelo: string, esfuerzo: string, conEsquema: boolean): object {
  return {
    fallbacks: 'default',
    output_config: {
      ...(soportaEffort(modelo) ? { effort: esfuerzo } : {}),
      // El copiloto NO lleva esquema de salida: su estructura la garantiza la
      // herramienta `responder`, cuyo `input_schema` valida la propia API.
      // Pedir las dos cosas a la vez sería exigir dos formas de la respuesta.
      ...(conEsquema ? { format: { type: 'json_schema', schema: ESQUEMA } } : {}),
    },
  }
}

const cabeceras = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: cabeceras })

interface Perfil {
  id: string
  rol: string
  clinica_id: string | null
}

/**
 * Quién llama, y si puede.
 *
 * Sin esto la función era **pública de hecho**: la clave anónima viaja dentro
 * del bundle que descarga cualquier visitante del sitio, así que bastaba
 * copiarla para invocar el modelo y gastar los créditos de Anthropic de la
 * plataforma.
 *
 * El rol se lee **en el servidor** con el cliente admin, no se cree lo que venga
 * en el cuerpo de la petición.
 *
 * No se exige un rol concreto: la usan admin, veterinario y recepción.
 * ⚠️ `peluquero` queda fuera **a propósito y por ahora**: su pantalla del
 * asistente (`JornadaClinica`) es una cola derivada de la base, sin IA ni
 * WhatsApp. Cuando el copiloto llegue a peluquería (fase 9) hay que revisarlo
 * aquí, no solo en el `RolRoute`.
 */
async function autorizar(
  peticion: Request,
): Promise<{ jwt: string; perfil: Perfil } | { error: string; status: number }> {
  const jwt = (peticion.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return { error: 'No tienes permiso para usar el asistente', status: 403 }

  const { data, error } = await admin.auth.getUser(jwt)
  if (error || !data.user) return { error: 'No tienes permiso para usar el asistente', status: 403 }

  const { data: perfil } = await admin
    .from('usuarios')
    .select('id, rol, activo, clinica_id')
    .eq('id', data.user.id)
    .maybeSingle()

  if (!perfil || perfil.activo !== true || !['admin', 'veterinario', 'recepcion'].includes(perfil.rol)) {
    return { error: 'No tienes permiso para usar el asistente', status: 403 }
  }
  if (!perfil.clinica_id) {
    // El superadmin no tiene clínica: no hay cuota que consumir ni datos suyos
    // que resumir. Su asistente es otro (`lib/asistentePlataforma.ts`).
    return { error: 'El asistente es de la clínica, no de la plataforma', status: 403 }
  }

  return { jwt, perfil: { id: perfil.id, rol: perfil.rol, clinica_id: perfil.clinica_id } }
}

/**
 * Que la clínica tenga contratado el copiloto.
 *
 * `ModuloRoute` ya lo comprueba en el frontend, pero **ocultar un enlace no
 * impide llamar a la función**: el token de un usuario legítimo de una clínica
 * sin el módulo sirve igual. Aquí sí hay algo que proteger de verdad —el gasto
 * en Anthropic—, así que la comprobación se repite en el servidor.
 *
 * ⚠️ Se consulta con **`comoUsuario`, no con `admin`**, aunque sea una decisión
 * de autorización. Con `admin` habría que pasarle un `clinicaId` y acertar; con
 * el token del usuario, `clinicas_select` (`id = auth_clinica_id()`) solo puede
 * devolver su propia clínica, así que **no existe la posibilidad de mirar el
 * plan equivocado**. Que la RLS haga el trabajo también aquí deja `admin`
 * tocando exactamente dos cosas en toda la función: validar el JWT y leer
 * `usuarios`.
 *
 * Falla cerrado: si no se puede leer, no hay copiloto.
 *
 * Devuelve también el nombre, que el copiloto necesita para su contexto: es la
 * misma fila y no tiene sentido pedirla dos veces.
 */
async function datosDeLaClinica(jwt: string): Promise<{ nombre: string; tieneIa: boolean }> {
  const { data } = await clienteDeUsuario(jwt)
    .from('clinicas')
    .select('nombre, planes(modulos_habilitados)')
    .maybeSingle()

  const fila = data as { nombre?: string; planes?: { modulos_habilitados?: string[] } | null } | null
  const modulos = fila?.planes?.modulos_habilitados
  return {
    nombre: fila?.nombre ?? 'la clínica',
    tieneIa: Array.isArray(modulos) && modulos.includes('asistente_ia'),
  }
}

/**
 * Deja constancia de lo que costó la llamada.
 *
 * Se inserta con el cliente **del usuario**, no con `admin`: así aplica la
 * policy `ia_uso_insert` y `clinica_id` sale de `auth_clinica_id()`.
 *
 * Nunca lanza. Un fallo al registrar no puede tirar una respuesta que ya está
 * escrita —el gasto ya se hizo—, así que se queja por consola y sigue.
 */
async function registrarUso(
  jwt: string,
  perfil: Perfil,
  datos: {
    modelo: string
    tarea: string
    herramientas?: string[]
    entrada?: TokensDeEntrada
    tokens_salida?: number
    duracion_ms: number
    resultado: 'ok' | 'error' | 'rechazo' | 'sin_cuota'
  },
) {
  try {
    const entrada = datos.entrada ?? { frescos: 0, cacheEscritura: 0, cacheLectura: 0 }
    const salida = datos.tokens_salida ?? 0
    const { error } = await clienteDeUsuario(jwt).from('ia_uso').insert({
      clinica_id: perfil.clinica_id,
      usuario_id: perfil.id,
      modelo: datos.modelo,
      tarea: datos.tarea,
      herramientas: datos.herramientas ?? [],
      // El TOTAL, caché incluida. Si solo se guardara `input_tokens`, la
      // columna diría «entrada» y contaría una parte.
      tokens_entrada: totalDeEntrada(entrada),
      tokens_salida: salida,
      costo_estimado_usd: costoEstimadoUsd(datos.modelo, entrada, salida),
      duracion_ms: datos.duracion_ms,
      resultado: datos.resultado,
    })
    if (error) console.error('asistente: no se pudo registrar el uso:', error.message)
  } catch (error) {
    console.error('asistente: no se pudo registrar el uso:', error)
  }
}

Deno.serve(async (peticion) => {
  if (peticion.method === 'OPTIONS') return new Response('ok', { headers: cabeceras })

  const inicio = Date.now()

  try {
    const acceso = await autorizar(peticion)
    if ('error' in acceso) return responder({ error: acceso.error }, acceso.status)
    const { jwt, perfil } = acceso

    const { tarea, contexto, pregunta } = await peticion.json()
    if (!esTarea(tarea)) return responder({ error: 'Tarea desconocida' }, 400)

    // El copiloto es lo único que recibe texto libre de quien pregunta, así que
    // es lo único que hay que acotar por tamaño: sin tope, el cuerpo de la
    // petición es una vía directa a inflar la factura de tokens.
    const consulta = typeof pregunta === 'string' ? pregunta.trim() : ''
    if (tarea === 'copiloto' && (consulta.length < 3 || consulta.length > 2000)) {
      return responder({ error: 'La pregunta tiene que tener entre 3 y 2000 caracteres' }, 400)
    }

    const clinica = await datosDeLaClinica(jwt)
    if (!clinica.tieneIa) {
      return responder({ error: 'El plan de la clínica no incluye el asistente de IA' }, 403)
    }

    const modelo = MODELO_POR_TAREA[tarea]

    // La cuota se consume ANTES de llamar al modelo, y en una sola sentencia
    // SQL: comprobar aquí y consumir después dejaría pasar dos pestañas con la
    // cuota al límite. Mismo criterio que `consumir_cuota_whatsapp()`.
    const { error: errorCuota } = await clienteDeUsuario(jwt).rpc('consumir_cuota_ia')
    if (errorCuota) {
      // `P0001` es el errcode que levanta a mano la función cuando no hay cuota.
      // Cualquier otro es un fallo de verdad (la función sin desplegar, la red)
      // y no se puede etiquetar igual: ese cartel ya costó un diagnóstico entero
      // con la cuota de WhatsApp.
      const sinCuota = errorCuota.code === 'P0001'
      await registrarUso(jwt, perfil, {
        modelo, tarea, duracion_ms: Date.now() - inicio,
        resultado: sinCuota ? 'sin_cuota' : 'error',
      })
      return responder(
        { error: sinCuota ? 'Se alcanzó el límite mensual de consultas de IA del plan' : 'No se pudo verificar la cuota de IA' },
        sinCuota ? 429 : 500,
      )
    }

    // El copiloto tiene su propio camino: un bucle de herramientas, no una sola
    // llamada. Las herramientas las ejecutamos NOSOTROS con el token de quien
    // preguntó, así que la RLS sigue aplicando igual que en cualquier pantalla.
    if (tarea === 'copiloto') {
      const resultado = await orquestar({
        cliente: client,
        sb: clienteDeUsuario(jwt),
        modelo,
        esfuerzo: ESFUERZO_POR_TAREA.copiloto,
        pregunta: consulta,
        rol: perfil.rol,
        clinica: clinica.nombre,
        parametrosExtra: (esfuerzo) => parametrosNoDeclaradosPorElSdk(modelo, esfuerzo, false),
      })

      await registrarUso(jwt, perfil, {
        modelo, tarea,
        // Sin repetidos: interesa QUÉ se consultó, no cuántas veces.
        herramientas: [...new Set(resultado.herramientas)],
        entrada: resultado.entrada,
        tokens_salida: resultado.salida,
        duracion_ms: Date.now() - inicio,
        resultado: 'ok',
      })

      return responder({
        respuesta: resultado.respuesta,
        herramientas: [...new Set(resultado.herramientas)],
      })
    }

    const respuesta = await client.beta.messages.create({
      model: modelo,
      // Por tarea, no una constante: el techo real depende del modelo (Haiku
      // 4.5 es más bajo que Opus o Sonnet 5), y estos textos son cortos de
      // sobra — 2 a 5 líneas — como para no necesitar más margen que ese.
      max_tokens: MAX_TOKENS_POR_TAREA[tarea],
      betas: ['server-side-fallback-2026-07-01'],
      system: [
        {
          type: 'text',
          text: INSTRUCCIONES_POR_TAREA[tarea],
          // Las instrucciones no cambian entre llamadas: se cachean.
          cache_control: { type: 'ephemeral' },
        },
      ],
      ...parametrosNoDeclaradosPorElSdk(modelo, ESFUERZO_POR_TAREA[tarea], true),
      messages: [{ role: 'user', content: JSON.stringify(contexto) }],
    })

    // ⚠️ Las tres, no solo `input_tokens`: los tokens de caché viajan aparte y
    // dejarlos fuera hace que el contador y el coste digan menos de lo que fue.
    const consumo = respuesta.usage as {
      input_tokens?: number
      output_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    } | undefined

    const uso = {
      modelo, tarea,
      entrada: {
        frescos: consumo?.input_tokens ?? 0,
        cacheEscritura: consumo?.cache_creation_input_tokens ?? 0,
        cacheLectura: consumo?.cache_read_input_tokens ?? 0,
      },
      tokens_salida: consumo?.output_tokens ?? 0,
      duracion_ms: Date.now() - inicio,
    }

    // Hay que mirar stop_reason antes que content: en un rechazo, content viene
    // vacío y leer content[0] reventaría.
    if (respuesta.stop_reason === 'refusal') {
      await registrarUso(jwt, perfil, { ...uso, resultado: 'rechazo' })
      return responder({ error: 'refusal' }, 422)
    }

    const bloque = respuesta.content.find((b) => b.type === 'text')
    if (!bloque || bloque.type !== 'text') {
      await registrarUso(jwt, perfil, { ...uso, resultado: 'error' })
      return responder({ error: 'Respuesta sin texto' }, 502)
    }

    const { texto } = JSON.parse(bloque.text) as { texto: string }
    await registrarUso(jwt, perfil, { ...uso, resultado: 'ok' })
    return responder({ texto })
  } catch (error) {
    console.error('asistente:', error)
    // El frontend cae a su plantilla ante cualquier fallo, así que aquí basta
    // con no fingir que salió bien. No se registra el uso: si se llegó hasta
    // aquí sin perfil resuelto no hay a quién cargárselo, y si se llegó con él
    // el error ya está en la consola de la función.
    return responder({ error: 'No se pudo redactar el mensaje' }, 500)
  }
})
