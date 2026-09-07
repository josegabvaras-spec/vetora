// Estado de vinculación de las cuentas del portal, para el panel de plataforma.
//
// ⚠️ ATRAVIESA EL AISLAMIENTO ENTRE INQUILINOS, Y ESTÁ ACOTADA A PROPÓSITO.
//
// El superadmin tiene `clinica_id = null`, así que `auth_clinica_id()` no
// empareja con nada y `clientes_personal` —que además exige
// `auth_es_personal()`, del que `superadmin` está excluido— le devuelve vacío.
// Eso es deliberado (ver CLAUDE.md) y **no se toca**: aquí NO se añade
// `or auth_es_plataforma()` a ninguna policy.
//
// Pero sin leer `clientes` no se puede responder a la única pregunta que el
// dueño de la plataforma necesita para dar soporte: «esta persona dice que
// entra al portal y no ve su mascota, ¿su cuenta está vinculada o quedó
// suelta?». Antes esa pregunta no tenía respuesta desde ninguna pantalla.
//
// LA ACOTACIÓN ES EL PUNTO: se devuelven **solo un booleano y un número** por
// cuenta. Ni nombres, ni CI, ni teléfonos, ni el id de la ficha, ni nada
// clínico. No es un lector de fichas y no debe convertirse en uno — para el
// volcado completo de una clínica ya existe `respaldo-clinica`, que es
// explícito sobre lo que hace. Si algún día hace falta más que esto, la
// pregunta correcta no es «qué campo añado aquí» sino «por qué la clínica no
// puede resolverlo desde su propia sección Clientes».
//
// Desplegar:
//   supabase functions deploy cuentas-portal
// Probar en local:
//   supabase functions serve cuentas-portal --env-file supabase/functions/.env.local

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

/** Mismo guard que `crear-cuenta`, `eliminar-usuario` y `eliminar-clinica`. */
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

  if (!perfil || perfil.activo !== true || perfil.rol !== 'superadmin') return false

  // ⚠️ Segundo factor (migración 0072). Esta función corre con `service_role`,
  // que **no aplica RLS**, así que el `aal2` que ahora exige
  // `auth_es_plataforma()` no la protege: sin esta comprobación, las cinco
  // funciones con guarda de superadmin serían la única puerta del sistema que
  // sigue abriéndose solo con la contraseña — y son justo las que crean
  // credenciales y borran clínicas enteras.
  //
  // Condicional a tener factor verificado, exactamente igual que en la base:
  // a quien todavía no lo configuró no se le puede exigir, o no podría entrar
  // a configurarlo.
  const { data: conMfa } = await admin.rpc('tiene_mfa_verificado', { p_usuario: data.user.id })
  if (conMfa !== true) return true

  return nivelDelJwt(jwt) === 'aal2'
}

/**
 * El `aal` del JWT: `aal1` con contraseña, `aal2` tras superar el desafío TOTP.
 *
 * ⚠️ Se lee el payload **sin volver a verificar la firma, y es correcto**:
 * quien llama a esto ya pasó por `admin.auth.getUser(jwt)`, que la valida
 * contra el servidor de Auth. Repetirla aquí sería trabajo duplicado; leer el
 * payload de un token que AÚN NO se ha validado sería el error, y no es el
 * caso — el orden importa y por eso está escrito.
 */
function nivelDelJwt(jwt: string): string {
  try {
    const cuerpo = jwt.split('.')[1]
    if (!cuerpo) return 'aal1'
    const base64 = cuerpo.replace(/-/g, '+').replace(/_/g, '/')
    const relleno = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const payload = JSON.parse(atob(relleno))
    return typeof payload.aal === 'string' ? payload.aal : 'aal1'
  } catch {
    // Un token ilegible no asciende a aal2. Fallar hacia el nivel bajo.
    return 'aal1'
  }
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

  try {
    if (!await esSuperadmin(peticion)) {
      return responder({ error: 'No tienes permiso para consultar las cuentas del portal' }, 403)
    }

    // Las fichas que tienen cuenta. `usuario_id` es único donde no es null
    // (índice parcial `clientes_por_usuario`, 0004), así que cada cuenta
    // aparece a lo sumo una vez.
    const { data: fichas, error: errorFichas } = await admin
      .from('clientes')
      .select('id, usuario_id')
      .not('usuario_id', 'is', null)

    if (errorFichas) {
      console.error('cuentas-portal: clientes', errorFichas)
      return responder({ error: 'No se pudo leer el estado de las cuentas' }, 500)
    }

    const porUsuario = new Map<string, string>()
    for (const f of fichas ?? []) {
      if (f.usuario_id) porUsuario.set(f.usuario_id as string, f.id as string)
    }

    // Conteo de mascotas por ficha, en una sola consulta. Solo interesa
    // «cuántas», nunca cuáles.
    const fichaIds = [...porUsuario.values()]
    const conteo = new Map<string, number>()

    if (fichaIds.length > 0) {
      const { data: pacientes, error: errorPacientes } = await admin
        .from('pacientes')
        .select('cliente_id')
        .in('cliente_id', fichaIds)

      if (errorPacientes) {
        console.error('cuentas-portal: pacientes', errorPacientes)
        return responder({ error: 'No se pudo contar las mascotas' }, 500)
      }

      for (const p of pacientes ?? []) {
        const id = p.cliente_id as string
        conteo.set(id, (conteo.get(id) ?? 0) + 1)
      }
    }

    // Una entrada por CUENTA, no por ficha: es lo que la pantalla tiene a mano.
    const estado: Record<string, { vinculada: boolean; mascotas: number }> = {}
    for (const [usuarioId, fichaId] of porUsuario) {
      estado[usuarioId] = { vinculada: true, mascotas: conteo.get(fichaId) ?? 0 }
    }

    // Las cuentas que no salen en el mapa no tienen ninguna fila en `clientes`
    // —el caso que dejaba `vincularPorIds` al fallar a medias, antes de que
    // fuera atómico—. La pantalla las trata como no vinculadas.
    return responder({ estado })
  } catch (error) {
    console.error('cuentas-portal:', error)
    return responder({ error: 'No se pudo consultar el estado de las cuentas' }, 500)
  }
})
