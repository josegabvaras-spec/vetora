// Asistente de avisos (PRD Épica 4). Redacta el mensaje de WhatsApp de un
// aviso, o el resumen del día para el administrador.
//
// Corre en el servidor y no en el navegador por una sola razón: la clave de
// Anthropic. Cualquier variable `VITE_*` acaba dentro del bundle que se
// descarga el cliente, así que una clave puesta ahí es una clave regalada.
//
// Desplegar:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy asistente
// Probar en local:
//   supabase functions serve asistente --env-file supabase/functions/.env.local

import Anthropic from 'npm:@anthropic-ai/sdk@^0.68.0'

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

const INSTRUCCIONES = `Eres quien escribe los mensajes de WhatsApp de una clínica veterinaria de Tarija, Bolivia.

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

const INSTRUCCIONES_INFORME = `Eres el asistente del administrador de una clínica veterinaria de Tarija, Bolivia.

Resume el día en 3 a 5 líneas, en español, para que lo lea de un vistazo en el celular.

Reglas:
- Empieza por lo que exige una decisión hoy: consentimientos que faltan, refuerzos vencidos, stock por debajo del mínimo.
- Cifras exactas, tal como vienen en los datos. No estimes ni redondees.
- Sin emojis ni signos de exclamación. Si no hay nada urgente, dilo en una línea y termina.`

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

const cabeceras = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

Deno.serve(async (peticion) => {
  if (peticion.method === 'OPTIONS') return new Response('ok', { headers: cabeceras })

  try {
    const { tarea, contexto } = await peticion.json()
    if (tarea !== 'aviso' && tarea !== 'informe') {
      return new Response(JSON.stringify({ error: 'Tarea desconocida' }), { status: 400, headers: cabeceras })
    }

    const respuesta = await client.beta.messages.create({
      model: 'claude-opus-5',
      // En Opus 5 el pensamiento está activo por defecto y comparte este techo
      // con el texto de salida: apretarlo cortaría la respuesta a media frase.
      max_tokens: 16000,
      // Un rechazo del clasificador no puede dejar sin avisar a un cliente.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        {
          type: 'text',
          text: tarea === 'aviso' ? INSTRUCCIONES : INSTRUCCIONES_INFORME,
          // Las instrucciones no cambian entre llamadas: se cachean.
          cache_control: { type: 'ephemeral' },
        },
      ],
      output_config: {
        // Redactar cuatro frases no da para más esfuerzo, y esto se llama una
        // vez por aviso: la diferencia se nota en la factura.
        effort: tarea === 'aviso' ? 'low' : 'medium',
        format: { type: 'json_schema', schema: ESQUEMA },
      },
      messages: [{ role: 'user', content: JSON.stringify(contexto) }],
    })

    // Hay que mirar stop_reason antes que content: en un rechazo, content viene
    // vacío y leer content[0] reventaría.
    if (respuesta.stop_reason === 'refusal') {
      return new Response(JSON.stringify({ error: 'refusal' }), { status: 422, headers: cabeceras })
    }

    const bloque = respuesta.content.find((b) => b.type === 'text')
    if (!bloque || bloque.type !== 'text') {
      return new Response(JSON.stringify({ error: 'Respuesta sin texto' }), { status: 502, headers: cabeceras })
    }

    const { texto } = JSON.parse(bloque.text) as { texto: string }
    return new Response(JSON.stringify({ texto }), { headers: cabeceras })
  } catch (error) {
    console.error('asistente:', error)
    // El frontend cae a su plantilla ante cualquier fallo, así que aquí basta
    // con no fingir que salió bien.
    return new Response(JSON.stringify({ error: 'No se pudo redactar el mensaje' }), {
      status: 500,
      headers: cabeceras,
    })
  }
})
