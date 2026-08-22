import { supabase } from '../lib/supabase'

/**
 * Tipo de cambio del dólar, la única configuración global de la plataforma.
 *
 * La suscripción se fija en dólares (migración 0019) porque lo que sostiene el
 * servicio se paga en dólares; pero las clínicas pagan en bolivianos, así que
 * hay que convertir en el momento de cobrar.
 *
 * La tabla tiene **una sola fila** por construcción (`id boolean primary key
 * check (id)`): no existe la pregunta de cuál de dos tipos de cambio es el
 * bueno.
 */
export interface ConfiguracionPlataforma {
  tipo_cambio_usd: number
  actualizado_at: string
}

/**
 * Valor de emergencia si la fila no se puede leer.
 *
 * No es «el tipo de cambio»: es lo que evita que un fallo de red deje la
 * plataforma multiplicando por cero y enseñando «Bs. 0.00» como si el plan
 * fuera gratis. Quien lo muestre debe seguir enseñando el dólar como precio.
 */
export const TIPO_CAMBIO_POR_DEFECTO = 6.96

export async function getConfiguracion(): Promise<ConfiguracionPlataforma> {
  const { data, error } = await supabase
    .from('configuracion_plataforma')
    .select('tipo_cambio_usd, actualizado_at')
    .maybeSingle()

  if (error || !data) {
    return { tipo_cambio_usd: TIPO_CAMBIO_POR_DEFECTO, actualizado_at: '' }
  }
  return { tipo_cambio_usd: Number(data.tipo_cambio_usd), actualizado_at: data.actualizado_at }
}

/** Solo el dueño de la plataforma: la policy de 0019 rechaza a cualquier otro. */
export async function setTipoCambio(tipoCambio: number): Promise<ConfiguracionPlataforma> {
  if (!Number.isFinite(tipoCambio) || tipoCambio <= 0) {
    throw new Error('El tipo de cambio debe ser un número mayor que cero.')
  }

  const { data, error } = await supabase
    .from('configuracion_plataforma')
    .update({ tipo_cambio_usd: tipoCambio, actualizado_at: new Date().toISOString() })
    .eq('id', true)
    .select('tipo_cambio_usd, actualizado_at')
    .single()

  if (error || !data) throw new Error(`No se pudo guardar el tipo de cambio: ${error?.message ?? ''}`)
  return { tipo_cambio_usd: Number(data.tipo_cambio_usd), actualizado_at: data.actualizado_at }
}

/**
 * Guarda el QR de cobro y las instrucciones de pago.
 *
 * El QR **no se recomprime**. `redimensionarImagen` produce JPEG con pérdida, y
 * sobre un código de barras eso es pedir que un día no escanee: se guarda el
 * archivo tal cual, en base64, con un tope de tamaño. Es una imagen pequeña y
 * la lee solo la pantalla de Facturación.
 */
export async function setDatosDePago(qrPago: string | null, datosPago: string): Promise<void> {
  const { data, error } = await supabase
    .from('configuracion_plataforma')
    .update({ qr_pago: qrPago, datos_pago: datosPago.trim(), actualizado_at: new Date().toISOString() })
    .eq('id', true)
    .select('id')

  if (error) throw new Error(`No se pudieron guardar los datos de pago: ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error('No se pudieron guardar los datos de pago: no tienes permiso')
  }
}

/** Lo que ocupa un QR de banco. Más que esto es una foto, no un código. */
export const MAX_BYTES_QR = 400 * 1024

/** Lee la imagen tal cual, sin tocarla, como data URI. */
export function leerComoDataUri(archivo: File): Promise<string> {
  if (!archivo.type.startsWith('image/')) {
    throw new Error('El QR debe ser una imagen')
  }
  if (archivo.size > MAX_BYTES_QR) {
    throw new Error('La imagen del QR pesa demasiado. Recórtala al código y vuelve a intentarlo.')
  }
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(String(lector.result))
    lector.onerror = () => reject(new Error('No se pudo leer la imagen'))
    lector.readAsDataURL(archivo)
  })
}
