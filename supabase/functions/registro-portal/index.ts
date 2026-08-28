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

/**
 * Número de cédula, sin el complemento ni prefijos.
 *
 * El CI boliviano se escribe de mil formas: con espacios, guiones, el
 * complemento pegado o un prefijo delante ("1234567 SC", "1234567-1A",
 * "1234567SC", "CI 1234567"). Lo único que de verdad identifica a la persona
 * es el número base — mismo criterio que `movil()` con el WhatsApp.
 *
 * Se queda con **la racha de dígitos más larga**. Las dos versiones anteriores
 * fallaban por lo mismo, cada una por un lado: quedarse con todos los dígitos
 * concatenaba el complemento de un CI reexpedido ("1234567-1A" → "12345671"),
 * y cortar por el primer separador se rompía con cualquier prefijo
 * ("CI 1234567" → "CI" → ""). La racha más larga acierta en los cuatro casos.
 *
 * ⚠️ Duplicada a propósito en `src/lib/identidad.ts`: Deno no puede importar
 * de `src/`. Si cambias una, cambia la otra — mismo criterio que `esSuperadmin`.
 */
function cedula(valor: string): string {
  const rachas = valor.match(/\d+/g) ?? []
  return rachas.sort((a, b) => b.length - a.length)[0] ?? ''
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
    // Se vincula en DOS NIVELES, y los dos son automáticos: no hay nada que
    // aprobar cuando aciertan.
    //
    //   Nivel 1 — CI + WhatsApp. La ficha tiene CI anotado y coinciden los dos.
    //   Nivel 2 — solo WhatsApp, y solo si la ficha NO tiene CI anotado y es la
    //             ÚNICA candidata de esa clínica con ese número.
    //
    // El nivel 2 existe porque el CI es opcional para recepción, y una ficha
    // sin CI no podía casar jamás: era la causa dominante de que el registro no
    // vinculara. La guarda de unicidad es lo que impide que sea el agujero de
    // H-5 con otro dato: para quedarse con una ficha ajena habría que saber el
    // número, acertar la clínica, que esa ficha no tenga CI y que no exista
    // ninguna otra con ese mismo número. Con dos o más candidatas no se vincula
    // nada — se manda a la sugerencia manual, que es donde decide una persona.
    //
    // Y una ficha cuyo WhatsApp coincide pero cuyo CI anotado NO coincide queda
    // descartada del nivel 2: un CI que no cuadra es una señal activa en
    // contra, no un dato ausente.
    //
    // Lo que no acierta aquí se resuelve a mano desde la sección «Clientes»
    // (`ClientesPage`), o desde la ficha del paciente con «Vincular cuenta del
    // portal» si se sabe el correo.
    type Motivo = 'ci_y_whatsapp' | 'whatsapp_unico' | 'sin_coincidencia' | 'ambiguo'

    let clienteVinculado = false
    let motivo: Motivo = 'sin_coincidencia'
    const movilQueTeclea = movil(whatsapp)
    const ciQueTeclea = cedula(ci)

    if (movilQueTeclea) {
      // La comparación se hace aquí y no en el `where` porque los formatos
      // guardados varían: hay que normalizar los dos lados. El CI no se puede
      // filtrar en la consulta (no hay forma de pedirle a PostgREST "solo
      // dígitos"), así que se traen las fichas sin reclamar de la clínica y se
      // compara en memoria — son a lo sumo unos cientos por clínica.
      const { data: fichas } = await admin
        .from('clientes')
        .select('id, ci, whatsapp')
        .eq('clinica_id', clinica.id)
        .is('usuario_id', null)

      // El WhatsApp es obligatorio en los dos niveles; lo que cambia es el
      // segundo factor.
      const porMovil = (fichas ?? []).filter((f) => movil(f.whatsapp ?? '') === movilQueTeclea)

      let elegida: { id: string } | null = null

      if (ciQueTeclea) {
        const exacta = porMovil.find((f) => cedula(f.ci ?? '') === ciQueTeclea)
        if (exacta) {
          elegida = exacta
          motivo = 'ci_y_whatsapp'
        }
      }

      if (!elegida) {
        const sinCi = porMovil.filter((f) => !cedula(f.ci ?? ''))
        if (sinCi.length === 1) {
          elegida = sinCi[0]
          motivo = 'whatsapp_unico'
        } else if (sinCi.length > 1) {
          motivo = 'ambiguo'
        }
      }

      if (elegida) {
        const { error } = await admin
          .from('clientes')
          .update({ usuario_id: usuarioId })
          .eq('id', elegida.id)
          .is('usuario_id', null)
        clienteVinculado = !error
        if (error) motivo = 'sin_coincidencia'
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
    //
    // `motivo` viaja para que el registro pueda EXPLICAR un vínculo fallido en
    // vez de mandar al dueño a un portal vacío sin decirle nada, que es lo que
    // pasaba antes.
    return responder({ email, clinica_nombre: clinica.nombre, vinculado: clienteVinculado, motivo })
  } catch (error) {
    console.error('registro-portal:', error)
    return responder({ error: 'No se pudo completar el registro' }, 500)
  }
})
