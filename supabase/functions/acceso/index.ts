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

const cabeceras = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const MINIMO = 8

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: cabeceras })
}

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

Deno.serve(async (peticion) => {
  if (peticion.method === 'OPTIONS') return new Response('ok', { headers: cabeceras })

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
