import { supabase } from '../lib/supabase'

/**
 * Segundo factor (TOTP) de Supabase Auth.
 *
 * ⚠️ **La barrera de verdad no está aquí: está en la RLS** (migración `0072`).
 * `auth_es_plataforma()` exige `aal2` a quien ya tenga un factor verificado, así
 * que un superadmin con MFA configurado no lee `clinicas` ni `planes` desde
 * PostgREST mientras su sesión siga en `aal1` — pase lo que pase con esta
 * pantalla. Las cinco Edge Functions con guarda de superadmin lo comprueban
 * aparte, porque corren con `service_role` y la RLS no las alcanza.
 *
 * Lo de aquí es lo que hace que la exigencia sea **usable**: sin una pantalla
 * que permita configurarlo y superarlo, la RLS solo sabría decir que no.
 *
 * La aplicación nunca ve el secreto TOTP más que para pintarlo una vez: lo
 * genera y lo guarda Supabase Auth, igual que las contraseñas.
 */

export interface EstadoMfa {
  /** Ya tiene un factor verificado: a partir de aquí la RLS le exige `aal2`. */
  tieneFactor: boolean
  /** `aal1` con contraseña; `aal2` tras superar el desafío. */
  nivelActual: string
  /** A lo que esta sesión PODRÍA subir. Si es `aal2`, falta superar el desafío. */
  nivelSiguiente: string
  /** El factor verificado, si lo hay: es lo que se desafía al entrar. */
  factorId: string | null
}

export interface InscripcionTotp {
  factorId: string
  /** Data URL con el QR, para escanear con la app del teléfono. */
  qr: string
  /** El mismo secreto en texto, para teclearlo cuando la cámara no colabora. */
  secreto: string
}

/**
 * Qué hace falta ahora mismo.
 *
 * `listFactors()` solo devuelve los **verificados**, así que un intento a medias
 * (alguien abrió la pantalla, no llegó a confirmar el código) no cuenta como
 * factor — que es justo lo correcto: la RLS tampoco lo cuenta, porque mira
 * `status = 'verified'`.
 */
export async function estadoMfa(): Promise<EstadoMfa> {
  const [factores, nivel] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])

  if (factores.error) throw factores.error
  if (nivel.error) throw nivel.error

  const verificado = (factores.data?.totp ?? []).find((f) => f.status === 'verified')

  return {
    tieneFactor: Boolean(verificado),
    nivelActual: nivel.data?.currentLevel ?? 'aal1',
    nivelSiguiente: nivel.data?.nextLevel ?? 'aal1',
    factorId: verificado?.id ?? null,
  }
}

/**
 * Empieza el alta de un TOTP: devuelve el QR y el secreto.
 *
 * ⚠️ Antes de inscribir se limpian los factores **sin verificar**. Supabase
 * rechaza un alta nueva si ya hay una pendiente con el mismo nombre, así que sin
 * esto un intento abandonado —cerrar la pestaña con el QR en pantalla— dejaba a
 * la persona sin poder volver a intentarlo nunca, con un error que no explica
 * nada. Solo se borra lo no verificado: un factor que funciona no se toca aquí.
 */
export async function inscribirTotp(): Promise<InscripcionTotp> {
  const { data: factores } = await supabase.auth.mfa.listFactors()
  for (const factor of factores?.all ?? []) {
    if (factor.status !== 'verified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id })
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Vetora',
  })
  if (error) throw error
  if (!data) throw new Error('No se pudo iniciar el registro del segundo factor')

  return {
    factorId: data.id,
    qr: data.totp.qr_code,
    secreto: data.totp.secret,
  }
}

/**
 * Confirma el código de seis dígitos.
 *
 * Sirve para las dos cosas —terminar el alta y superar el desafío al entrar—
 * porque en Supabase son la misma operación: un desafío y su verificación. Al
 * superarla, **la sesión se reemplaza por una de `aal2`**, y es eso, no un
 * estado de React, lo que abre la RLS.
 */
export async function confirmarCodigo(factorId: string, codigo: string): Promise<void> {
  const limpio = codigo.replace(/\D/g, '')
  if (limpio.length !== 6) {
    throw new Error('El código son 6 dígitos')
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: limpio,
  })

  if (error) {
    // El mensaje de Auth llega en inglés y es de los que la gente lee en un
    // momento de nervios. Se traduce el caso frecuente y se deja pasar el resto.
    const texto = error.message.toLowerCase()
    if (texto.includes('invalid') || texto.includes('expired')) {
      throw new Error('Ese código no es válido o ya caducó. Mira el siguiente en tu aplicación.')
    }
    throw error
  }
}
