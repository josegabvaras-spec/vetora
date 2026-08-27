// Borrado permanente de una clínica, desde el panel de plataforma.
//
// Es para cuando el cliente da de baja el servicio: a diferencia de suspender
// (`cambiarEstadoClinica`), que solo corta el acceso y conserva todo, esto no
// tiene vuelta atrás.
//
// Vive en una Edge Function aparte de `crear-cuenta` a propósito. Esa función
// solo borra cuentas de Auth HUÉRFANAS (sin fila en `usuarios`) — es el
// rollback de un alta que falló a medias, no un «borrar cualquier cuenta»
// (ver su cabecera). Aquí el caso es el opuesto: cuentas CON perfil, de una
// clínica entera. Mezclar los dos casos en la misma acción habría obligado a
// debilitar esa condición de seguridad.
//
// Tres cosas que el navegador no puede hacer con la sesión del superadmin:
//   1. Borrar objetos de Storage de otra clínica: las policies de
//      `storage.objects` exigen `auth_clinica_id()` propio, y la del
//      superadmin es null (0016, 0020).
//   2. Borrar las cuentas de `auth.users` del personal de esa clínica: eso es
//      `admin.auth.admin.deleteUser`, que exige `service_role`.
//   3. Nada, en realidad, para la fila de `clinicas` en sí: la policy
//      `clinicas_plataforma` (0001) ya es `for all` y el superadmin SÍ podría
//      borrarla con su propia sesión — pero entonces el paso 1 y el 2 se
//      quedarían sin hacer, y la propia función queda como el único lugar que
//      hace las tres cosas en el orden correcto.
//
// Orden: primero Storage y la lista de cuentas (nada irreversible todavía),
// luego el `DELETE` de `clinicas` (aquí es el punto sin retorno: la cascada de
// FK de 0001 en adelante limpia las otras ~20 tablas del inquilino solas),
// y al final las cuentas de Auth. Si algo falla ANTES del DELETE, no se ha
// perdido nada. Si falla DESPUÉS (una cuenta de Auth que no se pudo borrar),
// los datos ya se fueron: se informa cuántas fallaron en vez de fingir que
// todo salió perfecto.
//
// Desplegar:
//   supabase functions deploy eliminar-clinica
// Probar en local:
//   supabase functions serve eliminar-clinica --env-file supabase/functions/.env.local

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

/** Mismo guard que `crear-cuenta`: el rol se lee con el cliente admin, nunca se confía en el cuerpo. */
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

/**
 * Todos los archivos bajo un prefijo, en cualquier bucket, sin importar cuántos
 * niveles de "carpeta" tenga la ruta.
 *
 * `estudios` guarda en `{clinica_id}/{paciente_id}/{uuid}.jpg` (dos niveles);
 * `comprobantes`, en `{clinica_id}/{uuid}.jpg` (uno). Storage de Supabase no
 * tiene un "borra todo lo que empiece por X": `list()` solo enseña un nivel a
 * la vez, y una entrada sin `id` es una carpeta, no un archivo — hay que bajar
 * a buscar dentro.
 */
async function listarArchivos(bucket: string, prefijo: string): Promise<string[]> {
  const { data, error } = await admin.storage.from(bucket).list(prefijo, { limit: 1000 })
  if (error || !data) return []

  const archivos: string[] = []
  for (const item of data) {
    const ruta = `${prefijo}/${item.name}`
    if (item.id === null) {
      archivos.push(...(await listarArchivos(bucket, ruta)))
    } else {
      archivos.push(ruta)
    }
  }
  return archivos
}

async function vaciarStorageDeLaClinica(clinicaId: string): Promise<void> {
  for (const bucket of ['estudios', 'comprobantes', 'catalogo']) {
    const archivos = await listarArchivos(bucket, clinicaId)
    if (archivos.length === 0) continue
    const { error } = await admin.storage.from(bucket).remove(archivos)
    // No es el punto sin retorno: un archivo que no se pudo borrar es basura
    // en Storage, no un dato clínico huérfano. Se registra y se sigue.
    if (error) console.error(`eliminar-clinica: no se pudo vaciar ${bucket}`, error)
  }
}

Deno.serve(async (peticion) => {
  if (peticion.method === 'OPTIONS') return new Response('ok', { headers: cabeceras })

  try {
    if (!await esSuperadmin(peticion)) {
      return responder({ error: 'No tienes permiso para borrar clínicas' }, 403)
    }

    const cuerpo = await peticion.json()
    const clinicaId = texto(cuerpo.clinica_id)
    if (!clinicaId) return responder({ error: 'Falta la clínica a borrar' }, 400)

    const { data: clinica } = await admin.from('clinicas').select('id, nombre').eq('id', clinicaId).maybeSingle()
    if (!clinica) return responder({ error: 'Esa clínica ya no existe' }, 404)

    const { data: personal } = await admin.from('usuarios').select('id').eq('clinica_id', clinicaId)
    const idsDePersonal = (personal ?? []).map((u) => u.id as string)

    await vaciarStorageDeLaClinica(clinicaId)

    // El punto sin retorno: la cascada de FK (0001 en adelante) se lleva sola
    // sucursales, usuarios, pacientes, citas, historial, cobros... todo lo que
    // cuelga de `clinica_id`.
    const { error: errorBorrado } = await admin.from('clinicas').delete().eq('id', clinicaId)
    if (errorBorrado) {
      console.error('eliminar-clinica: delete clinicas', errorBorrado)
      return responder({ error: 'No se pudo borrar la clínica' }, 500)
    }

    // Borrar `usuarios` por cascada no toca `auth.users` — la flecha de
    // cascada corre al revés (auth.users -> usuarios). Sin este paso, cada
    // correo del personal de esta clínica quedaría reservado para siempre.
    let cuentasBorradas = 0
    let cuentasFallidas = 0
    for (const id of idsDePersonal) {
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) {
        console.error('eliminar-clinica: deleteUser', id, error)
        cuentasFallidas++
      } else {
        cuentasBorradas++
      }
    }

    return responder({ ok: true, cuentas_borradas: cuentasBorradas, cuentas_fallidas: cuentasFallidas })
  } catch (error) {
    console.error('eliminar-clinica:', error)
    return responder({ error: 'No se pudo completar el borrado' }, 500)
  }
})
