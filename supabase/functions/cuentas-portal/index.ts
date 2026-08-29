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

const cabeceras = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: cabeceras })
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

  return Boolean(perfil) && perfil!.activo === true && perfil!.rol === 'superadmin'
}

Deno.serve(async (peticion) => {
  if (peticion.method === 'OPTIONS') return new Response('ok', { headers: cabeceras })

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
