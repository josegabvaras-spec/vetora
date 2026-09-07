// Canje del enlace de acceso: `/acceso/:token`.
//
// ⚠️ RECONSTRUIDA. Esta función ya estaba desplegada en el proyecto pero su
//    código nunca estuvo en el repositorio (verificado en todo el historial de
//    git). Se escribe aquí para dejarla bajo control de versiones, a partir del
//    contrato que usa `src/services/invitaciones.ts` y del patrón de
//    `registro-portal`.
//
//    **No la despliegues sin comparar antes con la que corre en producción:**
//      supabase functions download acceso
//    Si la desplegada difiere y funciona, gana la desplegada.
//
// Existe porque quien abre el enlace **todavía no tiene sesión**: para las RLS
// es un anónimo y no puede leer ni su propia invitación. Y fijar la contraseña
// de otra cuenta es `auth.admin.updateUserById`, que exige `service_role`.
//
// El token ES la credencial. Sus defensas son tres:
//   1. caduca (`expira_at`),
//   2. se usa una sola vez (`usado_at`),
//   3. el reclamo es atómico: el `update … is('usado_at', null)` y la marca son
//      la misma sentencia, así que dos pestañas no pueden canjearlo las dos.
//
// Desplegar:
//   supabase functions deploy acceso
// Probar en local:
//   supabase functions serve acceso --env-file supabase/functions/.env.local

import { createClient } from 'npm:@supabase/supabase-js@^2.58.0'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

/**
 * `vetora.online` redirige a `www.vetora.online` a nivel de Vercel — el
 * navegador manda el segundo como `Origin` tras seguir el redirect, pero se
 * acepta el primero también por si algo lo llama directo. Los dos de
 * `localhost` son para `supabase functions serve` en desarrollo (ver la
 * cabecera del fichero): sin ellos, probar esta función en local con
 * `npm run dev` fallaría por CORS antes de llegar a la lógica.
 *
 * El origen se valida contra esta lista y nunca se acepta tal cual: antes
 * era `'*'`, que deja llamar a la función desde cualquier página de
 * internet. El riesgo real es bajo —la autenticación es por token Bearer,
 * no por cookie, así que un origen ajeno no puede adjuntar la sesión de
 * quien la visita— pero no cuesta nada acotarlo.
 */
const ORIGENES_PERMITIDOS = [
  'https://vetora.online',
  'https://www.vetora.online',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

function cabecerasCors(origen: string | null) {
  return {
    'Access-Control-Allow-Origin': origen && ORIGENES_PERMITIDOS.includes(origen) ? origen : ORIGENES_PERMITIDOS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  }
}

const MINIMO = 8

/**
 * Invitación utilizable, con su usuario y su clínica.
 *
 * Mensaje único para todos los motivos de rechazo: distinguir "no existe" de
 * "ya usado" o "caducado" le diría a quien prueba tokens al azar cuáles
 * existen.
 */
async function resolverToken(token: string) {
  const { data: invitacion } = await admin
    .from('invitaciones')
    .select('id, usuario_id, clinica_id, expira_at, usado_at')
    .eq('token', token)
    .maybeSingle()

  if (!invitacion) return null
  if (invitacion.usado_at) return null
  if (new Date(invitacion.expira_at).getTime() <= Date.now()) return null

  const { data: usuario } = await admin
    .from('usuarios')
    .select('id, nombre, email, activo')
    .eq('id', invitacion.usuario_id)
    .maybeSingle()

  // Una cuenta desactivada no estrena acceso aunque conserve un enlace vivo.
  if (!usuario || !usuario.activo) return null

  const { data: clinica } = await admin
    .from('clinicas')
    .select('nombre, estado')
    .eq('id', invitacion.clinica_id)
    .maybeSingle()

  if (!clinica || clinica.estado === 'suspendida') return null

  return { invitacion, usuario, clinica }
}

/** Forma exacta que espera `invocarAcceso` en services/invitaciones.ts. */
function resuelto(usuario: { id: string; nombre: string; email: string }, clinicaNombre: string) {
  return {
    usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email },
    clinica_nombre: clinicaNombre,
  }
}


/**
 * IP de quien llama, probando las cabeceras que ponen los distintos proxies.
 *
 * No se da por hecha ninguna: en la primera prueba contra produccion
 * `x-forwarded-for` llego vacia y el limite no se activo, cosa que solo se vio
 * porque el contador de la base seguia en cero. Se prueban en orden y, si
 * ninguna trae nada, se deja pasar — un problema de cabeceras no puede tumbar
 * la puerta publica.
 */
function ipDeLaPeticion(peticion: Request): string {
  const candidatas = [
    "x-forwarded-for",
    "x-real-ip",
    "cf-connecting-ip",
    "fly-client-ip",
    "true-client-ip",
  ]
  for (const nombre of candidatas) {
    const valor = (peticion.headers.get(nombre) ?? "").split(",")[0].trim()
    if (valor) return valor
  }
  return ""
}

/**
 * Cuenta el intento y dice si se pasa del limite.
 *
 * El estado vive en la base (`consumir_intento_publico`, migración `0068`) y no
 * en memoria: las Edge Functions son sin estado y pueden correr en varias
 * instancias a la vez, así que un contador local no contaría nada. Comprueba y
 * consume en UNA sentencia, igual que `consumir_cuota_whatsapp()`.
 */
async function dentroDelLimite(peticion: Request, prefijo: string, maximo: number, minutos: number) {
  const ip = ipDeLaPeticion(peticion)
  if (!ip) return true
  const { data, error } = await admin.rpc('consumir_intento_publico', {
    p_clave: `${prefijo}:${ip}`,
    p_maximo: maximo,
    p_ventana_minutos: minutos,
  })
  // Si el contador falla, se deja pasar: un fallo de la tabla de frecuencia no
  // puede tumbar el registro ni el canje de invitaciones.
  if (error) {
    console.error('limite de frecuencia:', error)
    return true
  }
  return data !== false
}

Deno.serve(async (peticion) => {
  const cabeceras = cabecerasCors(peticion.headers.get('origin'))
  if (peticion.method === 'OPTIONS') return new Response('ok', { headers: cabeceras })

  // Solo POST. Las ocho funciones interceptaban OPTIONS y despues aceptaban
  // GET, PUT o DELETE indistintamente, cayendo al catch al no poder parsear el
  // cuerpo (VUL-42). Rechazar con 405 es lo que corresponde y evita ruido en
  // los logs que parece un error de la funcion y no lo es.
  if (peticion.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Metodo no permitido' }), {
      status: 405,
      headers: { ...cabeceras, Allow: 'POST, OPTIONS' },
    })
  }

  function responder(cuerpo: unknown, status = 200) {
    return new Response(JSON.stringify(cuerpo), { status, headers: cabeceras })
  }

  // Más estricto que el registro: aquí lo que se prueba es un token, y el
  // único motivo por el que la fuerza bruta era impracticable era el tamaño del
  // espacio de un UUID v4 — nada la frenaba (VUL-18 / E-2). 20 en 10 minutos no
  // molesta a nadie que abra su enlace y falle un par de veces.
  if (!(await dentroDelLimite(peticion, 'acceso', 20, 10))) {
    return responder(
      { error: 'Demasiados intentos desde esta conexión. Espera unos minutos y vuelve a probar.' },
      429,
    )
  }

  try {
    const cuerpo = await peticion.json()
    const accion = typeof cuerpo.accion === 'string' ? cuerpo.accion : ''
    const token = typeof cuerpo.token === 'string' ? cuerpo.token.trim() : ''

    if (!token) return responder({ error: 'Enlace de acceso inválido' }, 400)

    const resuelto0 = await resolverToken(token)
    if (!resuelto0) {
      return responder({ error: 'Este enlace ya no es válido. Pide que te envíen uno nuevo.' }, 400)
    }
    const { invitacion, usuario, clinica } = resuelto0

    // Abrir la pantalla NO gasta el enlace: solo lo gasta crear la contraseña.
    if (accion === 'validar') {
      return responder(resuelto(usuario, clinica.nombre))
    }

    if (accion !== 'establecer') {
      return responder({ error: 'Acción no reconocida' }, 400)
    }

    const password = typeof cuerpo.password === 'string' ? cuerpo.password : ''
    if (password.length < MINIMO) {
      return responder({ error: `La contraseña debe tener al menos ${MINIMO} caracteres` }, 400)
    }
    if (password.trim().toLowerCase() === usuario.email.trim().toLowerCase()) {
      return responder({ error: 'La contraseña no puede ser tu propio correo' }, 400)
    }

    // Reclamo atómico: la condición `is('usado_at', null)` y la marca son la
    // misma sentencia. Si dos pestañas envían a la vez, solo una recibe fila.
    const { data: reclamada } = await admin
      .from('invitaciones')
      .update({ usado_at: new Date().toISOString() })
      .eq('id', invitacion.id)
      .is('usado_at', null)
      .select('id')

    if (!reclamada || reclamada.length === 0) {
      return responder({ error: 'Este enlace ya fue utilizado. Pide que te envíen uno nuevo.' }, 409)
    }

    const { error: errorPassword } = await admin.auth.admin.updateUserById(usuario.id, {
      password,
      // Se dio de alta con una contraseña temporal y sin confirmar el correo;
      // al canjear su enlace, la persona ya demostró que lo recibió.
      email_confirm: true,
    })

    if (errorPassword) {
      // Se libera el token: si no, un fallo aquí dejaría a la persona sin
      // contraseña Y sin enlace, sin más salida que pedir uno nuevo.
      await admin.from('invitaciones').update({ usado_at: null }).eq('id', invitacion.id)
      console.error('acceso: updateUserById', errorPassword)
      return responder({ error: 'No se pudo crear la contraseña. Vuelve a intentarlo.' }, 500)
    }

    // No se devuelve sesión: el frontend inicia sesión con la contraseña que
    // acaba de elegir. Sin eso las RLS seguirían viéndolo como anónimo.
    return responder(resuelto(usuario, clinica.nombre))
  } catch (error) {
    console.error('acceso:', error)
    return responder({ error: 'No se pudo abrir el acceso' }, 500)
  }
})
