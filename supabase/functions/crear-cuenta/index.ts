// Alta de la cuenta de Auth del personal, desde el panel de plataforma.
//
// Existe por lo mismo que `registro-portal`, y era la deuda que el propio
// `services/plataforma.ts` ya señalaba: crear la cuenta con `signUp` desde el
// navegador tiene tres problemas, y con «Confirm email» activado en Auth los
// tres se vuelven fallos reales:
//
//   1. **`signUp` manda un correo de confirmación** que aquí sobra y confunde:
//      a esta persona el acceso le llega por WhatsApp, con su enlace de un solo
//      uso (`invitaciones`). `admin.createUser` con `email_confirm: true` da la
//      cuenta por confirmada sin mandar nada — quien demuestra que el correo es
//      suyo es el token del enlace, no un clic en la bandeja de entrada.
//
//   2. **Con «Confirm email» activo, `signUp` oculta que el correo ya existe.**
//      Es la protección de Supabase contra la enumeración de usuarios: en vez de
//      un error devuelve un usuario falso, con un uuid inventado e `identities`
//      vacío. Ese uuid se insertaba luego en `usuarios.id`, que es
//      `references auth.users (id)` (0001:74), así que el alta moría con un
//      23503 incomprensible después de haber creado ya la clínica. Aquí el error
//      es de verdad porque `admin.createUser` no obfusca.
//
//   3. `signUp` devolvía sesión y **expulsaba al superadmin de la suya**. Con
//      `service_role` desde el servidor, la sesión de quien llama ni se toca.
//
// La acción `borrar` cierra el callejón sin salida que quedaba cuando el perfil
// fallaba tras crear la cuenta: el correo quedaba inutilizable para siempre
// («usa otro o bórralo desde el panel de Supabase»). Solo borra cuentas
// huérfanas —sin fila en `usuarios`—, que es justo el caso del rollback: así
// este endpoint no se convierte en un «borrar cualquier cuenta».
//
// Desplegar:
//   supabase functions deploy crear-cuenta
// Probar en local:
//   supabase functions serve crear-cuenta --env-file supabase/functions/.env.local

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

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: cabeceras })
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

/**
 * Esta función crea credenciales, así que **no puede ser pública**: se exige que
 * quien llama sea un superadmin activo. `functions.invoke` manda el JWT de la
 * sesión en `Authorization`; se valida contra Auth y luego se comprueba el rol
 * en `usuarios` con el cliente admin (la RLS no aplica aquí, por eso el rol se
 * lee explícitamente en vez de confiar en lo que venga en el cuerpo).
 */
async function esSuperadmin(peticion: Request): Promise<boolean> {
  const jwt = (peticion.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return false

  const { data, error } = await admin.auth.getUser(jwt)
  if (error || !data.user) return false

  const { data: perfil } = await admin
    .from('usuarios')
    .select('rol, activo')
    .eq('id', data.user.id)
    .maybeSingle()

  return Boolean(perfil) && perfil!.activo === true && perfil!.rol === 'superadmin'
}

Deno.serve(async (peticion) => {
  if (peticion.method === 'OPTIONS') return new Response('ok', { headers: cabeceras })

  try {
    if (!await esSuperadmin(peticion)) {
      return responder({ error: 'No tienes permiso para dar de alta cuentas' }, 403)
    }

    const cuerpo = await peticion.json()
    const accion = texto(cuerpo.accion)

    if (accion === 'crear') {
      const email = texto(cuerpo.email).toLowerCase()
      const nombre = texto(cuerpo.nombre)
      if (!email || !nombre) return responder({ error: 'Faltan el correo o el nombre' }, 400)

      const { data, error } = await admin.auth.admin.createUser({
        email,
        // Temporal y desechable: la persona fija la suya al canjear el enlace,
        // que es lo único que le da acceso. Nunca se le comunica.
        password: crypto.randomUUID(),
        // El enlace de WhatsApp hace de confirmación; sin esto, con «Confirm
        // email» activo la cuenta nace sin confirmar y no podría iniciar sesión.
        email_confirm: true,
        user_metadata: { nombre },
      })

      if (error || !data.user) {
        console.error('crear-cuenta: createUser', error)
        // A diferencia del registro público del portal, aquí sí conviene decir
        // que el correo está cogido: quien pregunta ya es el dueño de la
        // plataforma y lo necesita para resolver el alta.
        return responder({ error: error?.message ?? 'No se pudo crear la cuenta de acceso' }, 409)
      }

      return responder({ user_id: data.user.id })
    }

    if (accion === 'borrar') {
      const userId = texto(cuerpo.user_id)
      if (!userId) return responder({ error: 'Falta la cuenta a borrar' }, 400)

      // Solo huérfanas. Una cuenta con perfil se desactiva (`activo = false`),
      // no se borra: firma historiales y cobros, que son inmutables.
      const { data: perfil } = await admin
        .from('usuarios')
        .select('id')
        .eq('id', userId)
        .maybeSingle()

      if (perfil) {
        return responder({ error: 'Esa cuenta ya tiene perfil: desactívala en vez de borrarla' }, 409)
      }

      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) {
        console.error('crear-cuenta: deleteUser', error)
        return responder({ error: 'No se pudo deshacer la cuenta de acceso' }, 500)
      }

      return responder({ ok: true })
    }

    return responder({ error: 'Acción no reconocida' }, 400)
  } catch (error) {
    console.error('crear-cuenta:', error)
    return responder({ error: 'No se pudo completar el alta' }, 500)
  }
})
