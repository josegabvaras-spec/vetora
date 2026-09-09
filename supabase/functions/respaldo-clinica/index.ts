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

/**
 * Trae TODAS las filas de una tabla para una clínica, por páginas.
 *
 * Mismo problema y misma solución que `lib/paginacion.ts` en el frontend —no
 * se puede compartir el módulo porque esta función corre en Deno, no en
 * Vite—: PostgREST corta en `max_rows = 1000` sin error y sin ninguna señal,
 * así que un `select('*')` suelto sobre `citas` o `historial_clinico` en una
 * clínica con más de mil filas devolvía un respaldo incompleto que parecía
 * completo.
 */
const PAGINA = 1000

async function traerTablaCompleta(
  tabla: string,
  clinicaId: string,
): Promise<{ data: unknown[]; error: { message: string } | null }> {
  const acumulado: unknown[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await admin
      .from(tabla)
      .select('*')
      .eq('clinica_id', clinicaId)
      .range(desde, desde + PAGINA - 1)
    if (error) return { data: acumulado, error }
    const pagina = data ?? []
    acumulado.push(...pagina)
    if (pagina.length < PAGINA) return { data: acumulado, error: null }
  }
}

/**
 * Las 37 tablas de una clínica, **en orden de restauración** (cada una después
 * de aquellas a las que apunta). El orden sale del grafo real de claves
 * foráneas, consultado contra la base.
 *
 * ⚠️ Estas listas —esta, `TABLAS_RESPALDO` y `ORDEN_IMPORTACION`— tienen que
 * decir lo mismo. Eran once y luego dieciocho: con once no viajaba nada del
 * expediente clínico, y con dieciocho faltaba **todo lo que no es la
 * veterinaria clásica** (la peluquería entera, lotes, proveedores, órdenes de
 * compra, catálogo, vademécum, devoluciones, y hasta `sucursales`). Es VUL-36.
 *
 * Quedan fuera a propósito `invitaciones` (son tokens de acceso de un solo uso;
 * un respaldo no reparte credenciales), `ia_uso` y `registro_errores`
 * (telemetría de la plataforma, no datos de la clínica) y `onboarding_usuario`
 * (no tiene `clinica_id` y se regenera solo).
 *
 * ⚠️ Los ARCHIVOS de `estudios_imagen`, `peluqueria_fotos` y los comprobantes
 * de pago viven en Storage y no viajan aquí; esto restaura la ficha, no la
 * imagen.
 */
const TABLAS_EXPORTACION = [
  'sucursales',
  'usuarios',
  'proveedores',
  'servicios',
  'vademecum',
  'peluqueria_configuracion',
  'peluqueria_servicios_config',
  'petshop_configuracion',
  'petshop_promociones',
  'clientes',
  'pacientes',
  'productos',
  'producto_lotes',
  'catalogo_productos',
  'peluqueria_servicio_insumos',
  'ordenes_compra',
  'orden_compra_detalles',
  'turnos_caja',
  'citas',
  'historial_clinico',
  'recetas',
  'vacunas_aplicadas',
  'desparasitaciones_aplicadas',
  'consentimientos_cirugia',
  'informes_firmados',
  'estudios_imagen',
  'internaciones',
  'notas_internacion',
  'peluqueria_fichas',
  'cobros',
  'cobro_lineas',
  'movimientos_inventario',
  'petshop_devoluciones',
  'pagos_suscripcion',
  'peluqueria_ordenes',
  'peluqueria_comisiones',
  'peluqueria_fotos',
] as const

/**
 * Lo mismo, **menos `usuarios`**.
 *
 * ⚠️ `usuarios.id` es clave foránea a `auth.users`, y esta función no crea
 * cuentas de Auth (eso es `crear-cuenta`). Restaurar la fila del personal sobre
 * una clínica nueva reventaría con un 23503 y arrastraría el import entero al
 * `fallidas`; sobre la misma clínica sería un `update` que no cambia nada. Se
 * exporta —el directorio del personal es un dato de la clínica— y no se
 * restaura, porque sin la cuenta detrás no hay nada que restaurar.
 */
const TABLAS_IMPORTACION = TABLAS_EXPORTACION.filter(
  (tabla) => tabla !== 'usuarios',
) as readonly string[]

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

/**
 * Mismo criterio que `crear-cuenta`: el rol se lee en el servidor, no se cree.
 *
 * Devuelve el `id` de quien llama en vez de un `boolean` (como antes) porque
 * `registrarUso()` necesita saber A QUIÉN atribuir la operación — es la
 * bitácora de H-30, y una bitácora que no dice quién no dice nada.
 */
async function superadminActivo(peticion: Request): Promise<string | null> {
  const jwt = (peticion.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return null

  const { data, error } = await admin.auth.getUser(jwt)
  if (error || !data.user) return null

  const { data: perfil } = await admin
    .from('usuarios')
    .select('rol, activo')
    .eq('id', data.user.id)
    .maybeSingle()

  if (!perfil || perfil.activo !== true || perfil.rol !== 'superadmin') return null

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
  if (conMfa !== true) return data.user.id

  return nivelDelJwt(jwt) === 'aal2' ? data.user.id : null
}

/**
 * Bitácora de H-30: la política de privacidad promete que «cada uso [de esta
 * función] queda registrado», y hasta hoy no era cierto — no se escribía
 * nada. Ver migración `0074_registro_respaldos.sql`.
 *
 * Un fallo AL REGISTRAR no debe impedir que el respaldo se entregue: la
 * bitácora es una garantía adicional sobre la operación, no una condición
 * para que la operación exista. Si falla, queda constancia en los logs de la
 * función (que sí puede leer el operador desde el panel), y se sigue
 * adelante — el mismo criterio que ya usa el `catch` general de más abajo.
 */
async function registrarUso(
  usuarioId: string,
  clinicaId: string,
  accion: 'exportar' | 'importar',
  resultado: 'ok' | 'error',
  filas?: number,
  detalle?: string,
): Promise<void> {
  const { error } = await admin.from('registro_respaldos').insert({
    usuario_id: usuarioId,
    clinica_id: clinicaId,
    accion,
    resultado,
    filas: filas ?? null,
    detalle: detalle ?? null,
  })
  if (error) console.error('respaldo-clinica: no se pudo registrar el uso en la bitácora', error)
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

  // Declarados ANTES del try, no dentro: si algo revienta a medio camino, el
  // `catch` necesita saber quién llamaba y a qué clínica para poder
  // registrar el fallo en la bitácora de H-30. Es el mismo escarmiento que
  // ya documenta `asistente/index.ts` — ahí el catch no veía `jwt`/`perfil`
  // porque se resolvían dentro del try, y un fallo real no dejaba rastro.
  let usuarioId: string | null = null
  let clinicaId = ''
  let accion = ''

  try {
    usuarioId = await superadminActivo(peticion)
    if (!usuarioId) {
      return responder({ error: 'No tienes permiso para respaldar clínicas' }, 403)
    }

    const cuerpo = await peticion.json()
    accion = texto(cuerpo.accion)
    clinicaId = texto(cuerpo.clinicaId)
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
      let totalFilas = 0
      for (const tabla of TABLAS_EXPORTACION) {
        const { data, error } = await traerTablaCompleta(tabla, clinicaId)
        if (error) {
          // El mensaje crudo de Postgres lleva nombres de constraint y de columna.
          // Solo lo ve un superadmin, pero las otras siete funciones ya redactan
          // sus errores y esta era la excepcion (VUL-33).
          console.error(`respaldo-clinica: leer ${tabla}`, error)
          await registrarUso(usuarioId, clinicaId, 'exportar', 'error', undefined, `leer ${tabla}: ${error.message}`)
          return responder({ error: `No se pudo leer la tabla ${tabla}` }, 500)
        }
        tablas[tabla] = data ?? []
        totalFilas += tablas[tabla].length
      }
      await registrarUso(usuarioId, clinicaId, 'exportar', 'ok', totalFilas)
      return responder({ clinica: clinica.nombre, tablas })
    }

    if (accion === 'importar') {
      const tablas = cuerpo.tablas as Record<string, Record<string, unknown>[]> | undefined
      if (!tablas) return responder({ error: 'No llegaron datos que importar' }, 400)

      // `clinica_id` se REESCRIBE con el destino, no se respeta el del
      // archivo: el destino lo manda quien opera, no el contenido del ZIP.
      //
      // ⚠️ **Y ESO POR SÍ SOLO NO AÍSLA NADA — `upsert` resuelve por CLAVE
      // PRIMARIA, y los `id` del respaldo son los uuid VIVOS de la clínica de
      // origen.** Restaurar el respaldo de A sobre B, sin más, no inserta
      // filas nuevas para B: hace `update` sobre las filas de A poniéndoles
      // `clinica_id = B`. A pierde sus datos y B se los queda — una migración
      // silenciosa de expedientes clínicos entre inquilinos, con la RLS
      // intacta porque `service_role` no la aplica.
      //
      // La corrección, en dos pasos:
      //
      //   1. ANTES de escribir nada: por cada tabla, se comprueba si algún
      //      `id` del respaldo ya existe en la base con OTRO `clinica_id`. Si
      //      lo hay, se rechaza el import ENTERO — nada se escribe — porque
      //      eso es precisamente la clínica equivocada en el desplegable.
      //   2. Solo si el paso 1 no encontró ningún conflicto en ninguna tabla,
      //      se hace el upsert de todas. El caso legítimo — restaurar el
      //      respaldo de A sobre la propia A — no encuentra ningún conflicto
      //      (las filas ya son de A) y sigue funcionando exactamente igual
      //      que antes: un `update` en el sitio, no una migración.
      //
      // No se regeneran los `id` al importar a propósito: eso convertiría un
      // reintento del mismo respaldo en filas duplicadas cada vez, en vez de
      // conciliarse con lo que ya existe.
      for (const tabla of TABLAS_IMPORTACION) {
        const filas = tablas[tabla]
        if (!Array.isArray(filas) || filas.length === 0) continue

        const ids = filas.map((f) => f.id).filter((id): id is string => typeof id === 'string')
        if (ids.length === 0) continue

        const { data: existentes, error: errorLectura } = await admin
          .from(tabla)
          .select('id, clinica_id')
          .in('id', ids)

        if (errorLectura) {
          console.error(`respaldo-clinica: comprobar ${tabla}`, errorLectura)
          await registrarUso(usuarioId, clinicaId, 'importar', 'error', undefined, `comprobar ${tabla}: ${errorLectura.message}`)
          return responder({ error: `No se pudo comprobar la tabla ${tabla} antes de importar` }, 500)
        }

        const ajenas = (existentes ?? []).filter((fila) => fila.clinica_id !== clinicaId)
        if (ajenas.length > 0) {
          await registrarUso(
            usuarioId, clinicaId, 'importar', 'error', undefined,
            `${ajenas.length} fila(s) de ${tabla} ya pertenecen a otra clínica`,
          )
          return responder(
            {
              error:
                `Este respaldo no se puede importar en "${clinica.nombre}": ${ajenas.length} fila(s) ` +
                `de "${tabla}" ya pertenecen a otra clínica. Nada se importó.`,
            },
            409,
          )
        }
      }

      const fallidas: string[] = []
      let totalFilas = 0
      for (const tabla of TABLAS_IMPORTACION) {
        const filas = tablas[tabla]
        if (!Array.isArray(filas) || filas.length === 0) continue

        const conDestino = filas.map((fila) => ({ ...fila, clinica_id: clinicaId }))

        const { error } = await admin.from(tabla).upsert(conDestino)
        if (error) {
          console.error(`respaldo-clinica: importar ${tabla}`, error)
          fallidas.push(tabla)
        } else {
          totalFilas += conDestino.length
        }
      }

      if (fallidas.length > 0) {
        await registrarUso(usuarioId, clinicaId, 'importar', 'error', totalFilas, `fallaron: ${fallidas.join('; ')}`)
        return responder({ error: `No se pudieron importar: ${fallidas.join('; ')}` }, 500)
      }
      await registrarUso(usuarioId, clinicaId, 'importar', 'ok', totalFilas)
      return responder({ ok: true })
    }

    return responder({ error: 'Acción no reconocida' }, 400)
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error inesperado'
    // Solo si ya se sabía quién y sobre qué clínica: un fallo ANTES de pasar
    // el guard de superadmin (p. ej. `peticion.json()` con un cuerpo
    // corrupto) no tiene a quién atribuírselo.
    if (usuarioId && clinicaId) {
      await registrarUso(usuarioId, clinicaId, accion === 'importar' ? 'importar' : 'exportar', 'error', undefined, mensaje)
    }
    return responder({ error: mensaje }, 500)
  }
})
