// Alta de una cuenta del portal del cliente.
//
// Existe por la misma razón que `acceso`: quien se registra todavía no tiene
// sesión, así que para las RLS es anónimo y no puede escribir su fila en
// `usuarios`. Pero hay una razón más importante, y es de seguridad:
//
//   **El rol y la clínica NUNCA pueden venir del navegador.**
//
// La versión anterior insertaba `usuarios` desde el cliente con `rol` y
// `clinica_id` sacados de un formulario. Aunque la RLS lo bloqueaba, la forma
// era la equivocada: una petición HTTP se reescribe con `rol: 'admin'`. Aquí el
// rol es una constante del servidor y la clínica se valida contra la base.
//
// Desplegar:
//   supabase functions deploy registro-portal
// Probar en local:
//   supabase functions serve registro-portal --env-file supabase/functions/.env.local

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

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

/**
 * Últimos 8 dígitos de un teléfono, que en Bolivia son el número de móvil.
 *
 * Sirve para comparar lo que teclea quien se registra con lo que la clínica
 * tenga guardado, que rara vez está en el mismo formato: `+591 71234567`,
 * `71234567` y `591-7123-4567` tienen que casar entre sí.
 *
 * Devuelve cadena vacía si no hay 8 dígitos, y eso **no casa con nada** — es
 * deliberado: una ficha sin WhatsApp no se puede reclamar.
 */
function movil(valor: string): string {
  const digitos = valor.replace(/\D/g, '')
  return digitos.length >= 8 ? digitos.slice(-8) : ''
}

Deno.serve(async (peticion) => {
  if (peticion.method === 'OPTIONS') return new Response('ok', { headers: cabeceras })

  try {
    const cuerpo = await peticion.json()

    const email = texto(cuerpo.email).toLowerCase()
    const password = typeof cuerpo.password === 'string' ? cuerpo.password : ''
    const nombre = texto(cuerpo.nombre)
    const ci = texto(cuerpo.ci)
    const whatsapp = texto(cuerpo.whatsapp)
    const clinicaId = texto(cuerpo.clinica_id)

    if (!email || !nombre || !clinicaId) {
      return responder({ error: 'Faltan datos obligatorios' }, 400)
    }
    if (password.length < MINIMO) {
      return responder({ error: `La contraseña debe tener al menos ${MINIMO} caracteres` }, 400)
    }
    if (password.toLowerCase() === email) {
      return responder({ error: 'La contraseña no puede ser tu propio correo' }, 400)
    }

    // La clínica se valida contra la base: que exista y no esté suspendida. No
    // basta con que el formulario haya mandado un uuid.
    const { data: clinica } = await admin
      .from('clinicas')
      .select('id, nombre, estado')
      .eq('id', clinicaId)
      .maybeSingle()

    if (!clinica || clinica.estado === 'suspendida') {
      return responder({ error: 'La clínica seleccionada no está disponible' }, 400)
    }

    // Mensaje deliberadamente idéntico al de "correo ya registrado" más abajo:
    // distinguirlos permitiría enumerar qué correos tienen cuenta.
    const yaExiste = await admin.from('usuarios').select('id').eq('email', email).maybeSingle()
    if (yaExiste.data) {
      return responder({ error: 'No se pudo crear la cuenta con esos datos' }, 409)
    }

    const { data: creado, error: errorAuth } = await admin.auth.admin.createUser({
      email,
      password,
      // Llega por el formulario público, no por correo: sin esto no podría
      // iniciar sesión al terminar.
      email_confirm: true,
    })

    if (errorAuth || !creado.user) {
      return responder({ error: 'No se pudo crear la cuenta con esos datos' }, 409)
    }

    const usuarioId = creado.user.id

    // A partir de aquí, si algo falla hay que deshacer la cuenta de Auth: si no,
    // queda una credencial válida sin perfil, que no puede entrar a ningún sitio
    // pero tampoco se puede volver a registrar.
    async function deshacer(mensaje: string, status: number) {
      await admin.auth.admin.deleteUser(usuarioId)
      return responder({ error: mensaje }, status)
    }

    const { error: errorPerfil } = await admin.from('usuarios').insert({
      id: usuarioId,
      clinica_id: clinica.id,
      nombre,
      email,
      whatsapp,
      // Constantes del servidor: es lo que impide que nadie se registre como admin.
      rol: 'cliente',
      activo: true,
    })

    if (errorPerfil) {
      console.error('registro-portal: perfil', errorPerfil)
      return await deshacer('No se pudo crear la cuenta con esos datos', 409)
    }

    // Vínculo con la ficha que la clínica ya tuviera.
    //
    // ⚠️ Aquí se decide si alguien se queda con el expediente de otra persona:
    // sus mascotas, su historial, sus recetas. Antes bastaba con acertar el CI,
    // y un CI en Bolivia no es ningún secreto —está en cualquier documento— ni
    // el `clinica_id` tampoco, que lo publica `clinicas_para_registro()`. El
    // `is('usuario_id', null)` solo impedía robar una ficha YA reclamada; para
    // las demás no se comprobaba nada.
    //
    // Ahora tienen que coincidir **el CI y el WhatsApp**. No es prueba de
    // identidad —los dos son datos que un conocido podría saber—, pero sube el
    // listón de «sé tu carnet» a «sé tu carnet y tu teléfono».
    //
    // Si no casan, NO se vincula: se cae al camino de crear una ficha nueva, que
    // es seguro. La clínica las une después desde su panel. Perder el
    // automático es barato; entregar un expediente ajeno, no.
    //
    // Lo correcto de verdad sería que la clínica apruebe la vinculación. Está
    // anotado en SEGURIDAD.md como el paso siguiente.
    let clienteVinculado = false
    const movilQueTeclea = movil(whatsapp)

    if (ci && movilQueTeclea) {
      const { data: ficha } = await admin
        .from('clientes')
        .select('id, whatsapp')
        .eq('clinica_id', clinica.id)
        .eq('ci', ci)
        .is('usuario_id', null)
        .maybeSingle()

      // La comparación se hace aquí y no en el `where` porque los formatos
      // guardados varían: hay que normalizar los dos lados.
      if (ficha && movil(ficha.whatsapp ?? '') === movilQueTeclea) {
        const { error } = await admin
          .from('clientes')
          .update({ usuario_id: usuarioId })
          .eq('id', ficha.id)
          .is('usuario_id', null)
        clienteVinculado = !error
      }
    }

    // Sin ficha previa (o con una ya reclamada) se crea una nueva: el portal
    // necesita un `clientes.usuario_id` para que sus policies devuelvan algo.
    if (!clienteVinculado) {
      const { error } = await admin.from('clientes').insert({
        clinica_id: clinica.id,
        usuario_id: usuarioId,
        nombre,
        whatsapp,
        ci: ci || null,
      })

      if (error) {
        console.error('registro-portal: cliente', error)
        return await deshacer('No se pudo crear la cuenta con esos datos', 409)
      }
    }

    // No se devuelve sesión: el frontend inicia sesión con la contraseña que
    // acaba de elegir, igual que en el canje de invitación.
    return responder({ email, clinica_nombre: clinica.nombre, vinculado: clienteVinculado })
  } catch (error) {
    console.error('registro-portal:', error)
    return responder({ error: 'No se pudo completar el registro' }, 500)
  }
})
