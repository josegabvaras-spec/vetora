// Borrado permanente de un usuario de una clínica, desde el panel de
// plataforma.
//
// Mismo espíritu que `eliminar-clinica`, a escala de una sola persona: el
// superadmin ya puede leer/escribir `usuarios` por RLS (`usuarios_plataforma`,
// 0001), pero NO tiene RLS sobre las tablas clínicas y de caja que un
// veterinario o cajero puede haber firmado (`citas`, `historial_clinico`,
// `internaciones`, `notas_internacion`, `turnos_caja`, `cobros` — es el mismo
// invariante que justifica `respaldo-clinica`: la plataforma no ve datos de
// pacientes de ningún inquilino). Por eso el chequeo de actividad firmada
// tiene que hacerse aquí, con `service_role`, y no desde el navegador.
//
// Y, aparte del chequeo, borrar de verdad exige lo mismo que en
// `eliminar-clinica`: borrar la cuenta de `auth.users` es
// `admin.auth.admin.deleteUser`, que exige `service_role`. La fila de
// `usuarios` en sí el superadmin la podría borrar con su propia sesión
// (`usuarios_plataforma` ya es `for all`) — pero entonces la cuenta de Auth
// se queda sin borrar, y esta función es el único lugar que hace las dos
// cosas en el orden correcto, con el chequeo de actividad delante.
//
// A diferencia de `alternarActivoUsuario` (desactivar: sin vuelta atrás para
// nadie, pero reversible), esto SÍ es irreversible: por eso solo se permite
// cuando el usuario no firmó nada — ni una cita, ni un historial, ni una
// internación, ni una nota de internación, ni un turno de caja, ni un cobro.
// Si firmó algo, se desactiva, no se borra (mismo criterio documentado en
// `plataforma.ts`, `alternarActivoUsuario`).
//
// Desplegar:
//   supabase functions deploy eliminar-usuario
// Probar en local:
//   supabase functions serve eliminar-usuario --env-file supabase/functions/.env.local

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

/** Mismo guard que `crear-cuenta` y `eliminar-clinica`: el rol se lee con el cliente admin, nunca se confía en el cuerpo. */
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
 * Mismo criterio que `exigirOtroAdminActivo` en `services/plataforma.ts`,
 * repetido aquí porque esta función corre en Deno y no puede importar ese
 * módulo del frontend.
 */
async function esUnicoAdminActivo(usuario: {
  id: string
  clinica_id: string | null
  rol: string
  activo: boolean
}): Promise<boolean> {
  if (!usuario.activo || usuario.rol !== 'admin' || !usuario.clinica_id) return false

  const { count } = await admin
    .from('usuarios')
    .select('id', { count: 'exact', head: true })
    .eq('clinica_id', usuario.clinica_id)
    .eq('rol', 'admin')
    .eq('activo', true)
    .neq('id', usuario.id)

  return (count ?? 0) === 0
}

/**
 * Si el usuario firmó algo alguna vez, borrarlo lo dejaría sin autor — o,
 * peor, Postgres rechaza el DELETE con un 23503 críptico porque ninguna de
 * estas seis columnas tiene cascada (a propósito: son historiales y cobros
 * inmutables). Se comprueba antes para devolver un mensaje claro.
 *
 * Las seis son columnas de PERSONAL. Una cuenta del portal (`rol = 'cliente'`)
 * no aparece en ninguna, así que da 0 y se puede borrar — y eso es correcto,
 * no una casualidad: lo único que la referencia es `clientes.usuario_id`, cuya
 * FK es `on delete set null` (0004). Borrarla NO destruye la ficha ni las
 * mascotas: las suelta. Es, de hecho, la única forma que había de deshacer un
 * vínculo antes de que existiera `desvincular_cuenta_portal` (0028).
 */
async function tieneActividadFirmada(usuarioId: string): Promise<boolean> {
  const columnas: { tabla: string; columna: string }[] = [
    { tabla: 'citas', columna: 'veterinario_id' },
    { tabla: 'historial_clinico', columna: 'veterinario_id' },
    { tabla: 'internaciones', columna: 'veterinario_id' },
    { tabla: 'notas_internacion', columna: 'veterinario_id' },
    { tabla: 'turnos_caja', columna: 'usuario_id' },
    { tabla: 'cobros', columna: 'usuario_id' },
  ]

  const resultados = await Promise.all(
    columnas.map(({ tabla, columna }) =>
      admin.from(tabla).select('id', { count: 'exact', head: true }).eq(columna, usuarioId),
    ),
  )

  return resultados.some((r) => (r.count ?? 0) > 0)
}

Deno.serve(async (peticion) => {
  if (peticion.method === 'OPTIONS') return new Response('ok', { headers: cabeceras })

  try {
    if (!(await esSuperadmin(peticion))) {
      return responder({ error: 'No tienes permiso para borrar usuarios' }, 403)
    }

    const cuerpo = await peticion.json()
    const usuarioId = texto(cuerpo.usuario_id)
    if (!usuarioId) return responder({ error: 'Falta el usuario a borrar' }, 400)

    const { data: usuario } = await admin
      .from('usuarios')
      .select('id, clinica_id, rol, activo')
      .eq('id', usuarioId)
      .maybeSingle()
    if (!usuario) return responder({ error: 'Ese usuario ya no existe' }, 404)

    if (usuario.rol === 'superadmin') {
      return responder({ error: 'El usuario de plataforma no puede borrarse' }, 400)
    }

    if (await esUnicoAdminActivo(usuario)) {
      return responder(
        { error: 'Es el único administrador activo de la clínica: nombra otro antes de borrarlo' },
        400,
      )
    }

    if (await tieneActividadFirmada(usuarioId)) {
      return responder(
        {
          error:
            'Ya registró actividad clínica o de caja: no se puede borrar sin perder esos registros. Desactívalo en vez de borrarlo.',
        },
        400,
      )
    }

    // El punto sin retorno: la cascada de FK (0001 en adelante) se lleva por
    // delante sus invitaciones y su fila de onboarding; deja en null su
    // rastro en clientes/movimientos de inventario/informes firmados/registro
    // de errores, ninguno de los cuales bloquea el borrado.
    const { error: errorBorrado } = await admin.from('usuarios').delete().eq('id', usuarioId)
    if (errorBorrado) {
      console.error('eliminar-usuario: delete usuarios', errorBorrado)
      return responder({ error: 'No se pudo borrar el usuario' }, 500)
    }

    // Borrar `usuarios` no toca `auth.users` — la flecha de cascada corre al
    // revés (auth.users -> usuarios), igual que en `eliminar-clinica`. Sin
    // este paso el correo de este usuario queda reservado para siempre.
    const { error: errorAuth } = await admin.auth.admin.deleteUser(usuarioId)
    if (errorAuth) {
      console.error('eliminar-usuario: deleteUser', usuarioId, errorAuth)
      return responder({
        ok: true,
        cuenta_borrada: false,
        aviso:
          'El usuario se borró, pero su cuenta de acceso no se pudo eliminar del todo: su correo queda reservado.',
      })
    }

    return responder({ ok: true, cuenta_borrada: true })
  } catch (error) {
    console.error('eliminar-usuario:', error)
    return responder({ error: 'No se pudo completar el borrado' }, 500)
  }
})
