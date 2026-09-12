// Análisis de seguridad con IA — fase 3 de Vetora Security AI.
//
// =========================================================
// Qué hace, y qué NO hace
// =========================================================
// Corre las reglas determinísticas de `0079` y, **solo si marcan algo**, le
// pide al modelo que interprete el patrón: qué parece estar pasando, qué tan
// grave es, y qué debería hacer una persona. Devuelve un veredicto
// estructurado y **nunca ejecuta ninguna acción**.
//
// No desactiva cuentas, no suspende clínicas, no revoca sesiones, no borra
// nada. El encargo lo pide explícitamente y coincide con cómo está construido
// el resto del proyecto: la IA propone, una persona decide. Aquí eso no es una
// promesa del prompt — es que esta función **no tiene el verbo**: su único
// cliente de escritura es el que registra su propio coste en `ia_uso`.
//
// =========================================================
// El embudo, que es lo que lo hace viable
// =========================================================
//   evento  →  regla SQL (coste cero)  →  ¿marcó algo?  →  NO: fin, sin gasto
//                                                       →  SÍ: una llamada al modelo
//
// Sin ese filtro, analizar cada evento con IA costaría dinero por cada login
// de cada clínica todos los días, para decir «esto es normal» el 99,9 % de las
// veces. Con él, el gasto solo ocurre cuando ya hay algo raro que explicar.
//
// =========================================================
// Por qué solo el superadmin
// =========================================================
// El gasto en Anthropic lo paga la plataforma, no la clínica: esto no consume
// la cuota de IA del plan (`consumir_cuota_ia`), que existe para el asistente
// y el copiloto. Dejarlo abierto a cada admin sería dejar que cualquiera de
// ellos genere factura sin tope.
//
// Las clínicas NO se quedan sin nada: las reglas de `0079` son gratis y su
// admin ya las consulta directamente (`analizarEventos()` en
// `services/seguridad.ts`), acotadas a su clínica por la RLS. Lo que es solo
// del operador es la narrativa del modelo.
//
// ⚠️ **El MFA no se comprueba aquí, y no es un olvido.** Los eventos se leen
// con el token de quien llama, así que la policy `eventos_seguridad_plataforma`
// aplica, y esa cuelga de `auth_es_plataforma()` — que desde `0072` **ya exige
// `aal2`** cuando el superadmin tiene MFA configurado. Repetir la comprobación
// aquí sería una segunda copia de una regla que ya vive en la base, con el
// riesgo habitual de que las dos se separen.
//
// Desplegar:
//   supabase functions deploy analisis-seguridad

import Anthropic from 'npm:@anthropic-ai/sdk@^0.68.0'
import { createClient } from 'npm:@supabase/supabase-js@^2.58.0'

const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!
const CLAVE_ANONIMA = Deno.env.get('SUPABASE_ANON_KEY')!

// Solo para saber QUIÉN llama, igual que en `asistente`. Nada de negocio se
// lee con este cliente.
const admin = createClient(URL_SUPABASE, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Con el token de quien llamó: PostgREST le aplica sus policies tal cual. */
function clienteDeUsuario(jwt: string) {
  return createClient(URL_SUPABASE, CLAVE_ANONIMA, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

const MODELO = 'claude-sonnet-5'
const MAX_TOKENS = 4096
/** Tarifas verificadas de Sonnet 5, por millón de tokens. Ver `modelos.ts`. */
const TARIFA = { entrada: 2, salida: 10 }

/**
 * Tope de anomalías que se le mandan al modelo.
 *
 * No es solo coste: un prompt con trescientos patrones no produce mejor
 * análisis, produce uno más vago. Las reglas ya vienen ordenadas por severidad
 * (`0079`), así que recortar por arriba deja justo lo que más importa.
 */
const MAX_ANOMALIAS = 40

const ORIGENES_PERMITIDOS = [
  'https://vetora.online',
  'https://www.vetora.online',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

function cabecerasCors(origen: string | null) {
  return {
    'Access-Control-Allow-Origin':
      origen && ORIGENES_PERMITIDOS.includes(origen) ? origen : ORIGENES_PERMITIDOS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  }
}

/**
 * ⚠️ Las anomalías son DATOS, no instrucciones.
 *
 * Hoy su contenido lo genera la propia base (nombres de regla fijos, conteos,
 * uuid), así que la superficie de inyección es mínima — pero llegan igualmente
 * como mensaje de usuario y nunca concatenadas aquí dentro, que es la
 * separación que la API garantiza por tipo de bloque y no por convención. Si
 * mañana una regla incluye texto escrito por una persona, esta función no
 * necesita cambiar para seguir siendo segura.
 */
const INSTRUCCIONES = `Eres el analista de seguridad de Vetora, un sistema de gestión para clínicas veterinarias de Bolivia.

Recibes patrones que unas reglas automáticas ya marcaron como anómalos. Tu trabajo es interpretarlos para la persona que opera la plataforma: qué parece estar pasando, qué tan preocupante es, y qué debería hacer.

CÓMO RAZONAR

Cada patrón tiene una explicación aburrida y una preocupante. Considera las dos antes de decidir:
- Tres exportaciones seguidas: alguien llevándose los datos, o una clínica cambiando de computadora.
- Un ascenso a administrador: una promoción normal, o una cuenta comprometida ampliando su alcance.
- Actividad de madrugada: una urgencia veterinaria real, o alguien operando cuando no hay nadie mirando.
- Muchos accesos con la misma cuenta: una credencial compartida entre puestos, o un ataque.

Si varios patrones coinciden en la misma clínica o la misma cuenta, dilo: un solo patrón raro es ruido, tres a la vez sobre la misma cuenta es una historia.

REGLAS

- No afirmes que hubo un ataque. Di qué es compatible con los datos y qué haría falta para confirmarlo.
- No inventes datos que no estén en los patrones. No tienes acceso a nada más.
- Escribe para alguien que conoce su negocio pero no es experto en seguridad: sin jerga, sin siglas sin explicar.
- Recomienda pasos concretos y reversibles primero (preguntarle a la persona, revisar con ella) antes que drásticos (desactivar la cuenta).
- Nunca vas a ejecutar nada de lo que recomiendes: lo hace una persona, si decide hacerlo.

Responde SIEMPRE llamando a la herramienta 'reportar_analisis'.`

/**
 * La estructura del veredicto **la valida la API**, no un `JSON.parse` a la
 * defensiva sobre texto libre. Mismo criterio que la herramienta `responder`
 * del copiloto: pedir un JSON en el prompt y confiar en que salga bien es lo
 * que produce respuestas que hay que parsear con miedo.
 */
const HERRAMIENTA_REPORTE = {
  name: 'reportar_analisis',
  description: 'Entrega el análisis de los patrones de seguridad recibidos.',
  input_schema: {
    type: 'object' as const,
    properties: {
      resumen: {
        type: 'string',
        description: 'Dos o tres frases, en lenguaje llano, sobre qué está pasando.',
      },
      severidad: {
        type: 'string',
        enum: ['info', 'baja', 'media', 'alta', 'critica'],
        description: 'Tu valoración global, que puede diferir de la de las reglas.',
      },
      riesgo: {
        type: 'integer',
        description: 'De 0 a 100. Cuánto merece la atención de una persona ahora mismo.',
      },
      confianza: {
        type: 'number',
        description: 'De 0 a 1. Qué tan seguro estás de tu lectura con los datos que tienes.',
      },
      hallazgos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            patron: { type: 'string', description: 'Qué patrón interpretas.' },
            explicacion_probable: { type: 'string', description: 'La lectura más plausible.' },
            explicacion_preocupante: { type: 'string', description: 'La lectura de riesgo.' },
            que_lo_distinguiria: {
              type: 'string',
              description: 'Qué dato o pregunta separaría una explicación de la otra.',
            },
          },
          required: ['patron', 'explicacion_probable', 'explicacion_preocupante', 'que_lo_distinguiria'],
        },
      },
      recomendaciones: {
        type: 'array',
        items: { type: 'string' },
        description: 'Pasos concretos, del menos invasivo al más.',
      },
      requiere_revision_humana: {
        type: 'boolean',
        description: 'Si alguien debería mirarlo hoy mismo.',
      },
    },
    required: ['resumen', 'severidad', 'riesgo', 'confianza', 'hallazgos', 'recomendaciones', 'requiere_revision_humana'],
  },
}

function costoEstimadoUsd(entrada: number, salida: number): number {
  return Number(
    ((entrada / 1_000_000) * TARIFA.entrada + (salida / 1_000_000) * TARIFA.salida).toFixed(6),
  )
}

/**
 * Registra el coste con `service_role`, no con el token del superadmin.
 *
 * ⚠️ No es comodidad: la policy `ia_uso_insert` (`0045`) exige
 * `auth_es_personal()`, y **el superadmin no es personal** — su inserción se
 * rechazaría. Mismo camino que `registro_respaldos` en `respaldo-clinica`.
 *
 * Nunca lanza: perder la línea de coste no puede tumbar el análisis.
 */
async function registrarCoste(
  usuarioId: string,
  entrada: number,
  salida: number,
  duracionMs: number,
  resultado: 'ok' | 'error' | 'rechazo',
): Promise<void> {
  try {
    await admin.from('ia_uso').insert({
      clinica_id: null,
      usuario_id: usuarioId,
      modelo: MODELO,
      tarea: 'seguridad',
      herramientas: [],
      tokens_entrada: entrada,
      tokens_salida: salida,
      costo_estimado_usd: costoEstimadoUsd(entrada, salida),
      duracion_ms: duracionMs,
      resultado,
    })
  } catch (e) {
    console.error('analisis-seguridad: no se pudo registrar el coste', e)
  }
}

Deno.serve(async (peticion) => {
  const cors = cabecerasCors(peticion.headers.get('Origin'))
  const responder = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: cors })

  if (peticion.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Declarados ANTES del try, para que el `catch` pueda registrar el fallo.
  // Es la corrección que `asistente` ya llevaba: con las variables dentro del
  // `try`, un error real no dejaba rastro en `ia_uso` y solo se veía en unos
  // logs que nadie puede leer sin el panel de Supabase.
  let usuarioId = ''
  const inicio = Date.now()

  try {
    const jwt = (peticion.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!jwt) return responder({ error: 'No tienes permiso para usar el análisis de seguridad' }, 403)

    const { data: auth, error: errorAuth } = await admin.auth.getUser(jwt)
    if (errorAuth || !auth.user) {
      return responder({ error: 'No tienes permiso para usar el análisis de seguridad' }, 403)
    }

    const { data: perfil } = await admin
      .from('usuarios')
      .select('id, rol, activo')
      .eq('id', auth.user.id)
      .maybeSingle()

    if (!perfil || perfil.activo !== true || perfil.rol !== 'superadmin') {
      return responder({ error: 'Solo la plataforma puede ejecutar el análisis de seguridad' }, 403)
    }
    usuarioId = perfil.id

    const cuerpo = await peticion.json().catch(() => ({}))
    const horas = Number.isFinite(cuerpo?.horas) ? Math.trunc(cuerpo.horas) : 24

    // Las reglas, con el token de quien llama: la RLS decide qué eventos entran
    // en el análisis, y de paso exige `aal2` a través de `auth_es_plataforma()`.
    const { data: anomalias, error: errorReglas } = await clienteDeUsuario(jwt).rpc(
      'analizar_eventos_seguridad',
      { p_horas: horas },
    )

    if (errorReglas) {
      console.error('analisis-seguridad: fallaron las reglas', errorReglas)
      return responder({ error: 'No se pudieron correr las reglas de detección' }, 500)
    }

    const marcadas = (anomalias ?? []) as unknown[]

    // ⚠️ El corte que hace todo esto sostenible: sin anomalías no hay llamada
    // al modelo, y por tanto no hay gasto. Devolver "todo tranquilo" tiene que
    // ser barato, porque es la respuesta del 99 % de los días.
    if (marcadas.length === 0) {
      return responder({
        anomalias: [],
        analisis: null,
        motivo: 'sin_anomalias',
        horas,
      })
    }

    const respuesta = await client.messages.create({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      system: INSTRUCCIONES,
      tools: [HERRAMIENTA_REPORTE],
      tool_choice: { type: 'tool', name: 'reportar_analisis' },
      messages: [
        {
          role: 'user',
          content: `Patrones detectados en las últimas ${horas} horas:\n\n${JSON.stringify(
            marcadas.slice(0, MAX_ANOMALIAS),
            null,
            2,
          )}`,
        },
      ],
    })

    const entrada = respuesta.usage?.input_tokens ?? 0
    const salida = respuesta.usage?.output_tokens ?? 0

    const bloque = respuesta.content.find((c) => c.type === 'tool_use')
    if (!bloque || bloque.type !== 'tool_use') {
      // Sin plantilla de respaldo, al igual que el copiloto: inventar un
      // análisis de seguridad sería peor que decir que no se pudo hacer.
      await registrarCoste(usuarioId, entrada, salida, Date.now() - inicio, 'rechazo')
      return responder(
        { anomalias: marcadas, analisis: null, motivo: 'sin_respuesta_del_modelo', horas },
        200,
      )
    }

    await registrarCoste(usuarioId, entrada, salida, Date.now() - inicio, 'ok')

    return responder({
      anomalias: marcadas,
      analisis: bloque.input,
      motivo: 'analizado',
      horas,
    })
  } catch (e) {
    console.error('analisis-seguridad: fallo', e)
    if (usuarioId) await registrarCoste(usuarioId, 0, 0, Date.now() - inicio, 'error')
    return responder({ error: 'No se pudo completar el análisis de seguridad' }, 500)
  }
})
