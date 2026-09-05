// Respaldo y restauración de una clínica, desde el panel de plataforma.
//
// ⚠️ ESTA FUNCIÓN ATRAVIESA EL AISLAMIENTO ENTRE INQUILINOS, A PROPÓSITO.
//
// El superadmin tiene `clinica_id = null`, así que `auth_clinica_id()` no
// empareja con ninguna fila y la RLS le devuelve vacío en todas las tablas
// clínicas. Eso es deliberado (ver CLAUDE.md) y **no se toca**: aquí NO se
// añade `or auth_es_plataforma()` a ninguna policy, porque eso abriría el
// acceso lateral de forma permanente y para toda la aplicación.
//
// En su lugar, la lectura se hace con `service_role` desde el servidor, acotada
// a UNA clínica concreta y solo para quien demuestra ser superadmin activo. Las
// policies de negocio siguen exactamente igual de cerradas que antes.
//
// Desplegar:
//   supabase functions deploy respaldo-clinica
// Probar en local:
//   supabase functions serve respaldo-clinica --env-file supabase/functions/.env.local

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

/** Mismas tablas que `lib/exportacion.ts`; el orden importa al restaurar. */
const TABLAS = [
  'clientes',
  'pacientes',
  'productos',
  'turnos_caja',
  'citas',
  'historial_clinico',
  'internaciones',
  'notas_internacion',
  'cobros',
  'cobro_lineas',
  'movimientos_inventario',
] as const

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: cabeceras })
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

/** Mismo criterio que `crear-cuenta`: el rol se lee en el servidor, no se cree. */
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
      return responder({ error: 'No tienes permiso para respaldar clínicas' }, 403)
    }

    const cuerpo = await peticion.json()
    const accion = texto(cuerpo.accion)
    const clinicaId = texto(cuerpo.clinicaId)
    if (!clinicaId) return responder({ error: 'Falta la clínica' }, 400)

    // Que exista de verdad: sin esto, un id inventado devolvería once tablas
    // vacías y parecería una clínica sin datos en vez de un error.
    const { data: clinica } = await admin
      .from('clinicas')
      .select('id, nombre')
      .eq('id', clinicaId)
      .maybeSingle()
    if (!clinica) return responder({ error: 'La clínica no existe' }, 404)

    if (accion === 'exportar') {
      const tablas: Record<string, unknown[]> = {}
      for (const tabla of TABLAS) {
        const { data, error } = await admin.from(tabla).select('*').eq('clinica_id', clinicaId)
        if (error) return responder({ error: `No se pudo leer ${tabla}: ${error.message}` }, 500)
        tablas[tabla] = data ?? []
      }
      return responder({ clinica: clinica.nombre, tablas })
    }

    if (accion === 'importar') {
      const tablas = cuerpo.tablas as Record<string, Record<string, unknown>[]> | undefined
      if (!tablas) return responder({ error: 'No llegaron datos que importar' }, 400)

      const fallidas: string[] = []
      for (const tabla of TABLAS) {
        const filas = tablas[tabla]
        if (!Array.isArray(filas) || filas.length === 0) continue

        // `clinica_id` se REESCRIBE con el destino, no se respeta el del
        // archivo: el destino lo manda quien opera, no el contenido del ZIP.
        //
        // ⚠️ **PERO ESTO NO AÍSLA NADA, Y EL COMENTARIO QUE HABÍA AQUÍ ANTES
        // AFIRMABA LO CONTRARIO.** Decía que sin la reescritura se «insertarían
        // filas que la B nunca podría leer»; la realidad es peor y va en la
        // dirección opuesta. `upsert` resuelve el conflicto por **clave
        // primaria**, y los `id` que vienen en el respaldo son los uuid VIVOS de
        // la clínica de origen. Así que restaurar el respaldo de A sobre B no
        // inserta filas nuevas: hace `update` sobre las filas de A poniéndoles
        // `clinica_id = B`. **A pierde sus datos y B se los queda** — una
        // migración silenciosa de expedientes clínicos entre inquilinos, con la
        // RLS intacta porque `service_role` no la aplica.
        //
        // Solo el superadmin puede llegar aquí, y lo más probable es que sea por
        // error (elegir la clínica equivocada en el desplegable). Sigue sin
        // arreglarse: la corrección es regenerar los identificadores al importar,
        // o rechazar la importación si algún `id` ya existe en otra clínica.
        const conDestino = filas.map((fila) => ({ ...fila, clinica_id: clinicaId }))

        const { error } = await admin.from(tabla).upsert(conDestino)
        if (error) fallidas.push(`${tabla} (${error.message})`)
      }

      if (fallidas.length > 0) {
        return responder({ error: `No se pudieron importar: ${fallidas.join('; ')}` }, 500)
      }
      return responder({ ok: true })
    }

    return responder({ error: 'Acción no reconocida' }, 400)
  } catch (err) {
    return responder({ error: err instanceof Error ? err.message : 'Error inesperado' }, 500)
  }
})
