import { supabase } from '../lib/supabase'
import { redimensionarImagen } from '../lib/imagen'
import { usdABs } from '../lib/currency'
import { TIPO_CAMBIO_POR_DEFECTO } from './configuracion'
import type { EstadoClinica, EstadoPago, PagoSuscripcion, Plan } from '../types/database'

/**
 * La suscripción vista desde la clínica (migración 0020).
 *
 * No hay pasarela de pago: la clínica escanea el QR del dueño de la plataforma,
 * paga por su banco y sube la foto del comprobante. El superadministrador la
 * revisa desde su asistente y, al aprobarla, `proximo_cobro` avanza tantos
 * meses como cubra el pago.
 *
 * **La clínica no puede aprobarse nada.** La policy `pagos_clinica_insert`
 * exige que la fila nazca `pendiente` y sin los campos de revisión, y no hay
 * policy de UPDATE para la clínica: un comprobante enviado no se retoca. Todo
 * lo que cambia el estado de pago vive en `services/plataforma.ts`, bajo la
 * única policy de UPDATE de `clinicas`, que es del superadmin.
 */

const BUCKET = 'comprobantes'

/** Opciones de renovación. Pagar por adelantado ahorra idas y venidas. */
export const MESES_RENOVACION = [1, 3, 6, 12] as const

export interface ResumenSuscripcion {
  clinica_id: string
  clinica_nombre: string
  plan: Plan
  /** Lo pactado con esta clínica, que puede diferir del precio de lista. */
  precio_acordado_usd: number
  tipo_cambio_usd: number
  proximo_cobro: string
  estado_pago: EstadoPago
  estado: EstadoClinica
}

export interface DatosDePago {
  /** Imagen del QR como data URI, tal cual la subió el dueño de la plataforma. */
  qr_pago: string | null
  /** Banco, número de cuenta, titular… texto libre. */
  datos_pago: string
  tipo_cambio_usd: number
}

/**
 * Plan y estado de cobro de la clínica de la sesión.
 *
 * `clinicas` se filtra sola por RLS (`id = auth_clinica_id()`), así que no hace
 * falta pasarle el id: pedirlo sería confiar en el cliente para algo que la
 * base ya decide.
 */
export async function getResumenSuscripcion(): Promise<ResumenSuscripcion> {
  const { data: clinica, error } = await supabase
    .from('clinicas')
    .select('id, nombre, plan_id, precio_acordado_usd, proximo_cobro, estado_pago, estado')
    .limit(1)
    .maybeSingle()

  if (error || !clinica) {
    throw new Error(`No se pudo leer la suscripción: ${error?.message ?? 'clínica no encontrada'}`)
  }

  const { data: plan } = await supabase.from('planes').select('*').eq('id', clinica.plan_id).maybeSingle()
  if (!plan) throw new Error('La clínica no tiene un plan válido asignado')

  const { data: config } = await supabase
    .from('configuracion_plataforma')
    .select('tipo_cambio_usd')
    .maybeSingle()

  return {
    clinica_id: clinica.id,
    clinica_nombre: clinica.nombre,
    plan: plan as Plan,
    precio_acordado_usd: Number(clinica.precio_acordado_usd),
    // `?? 0` era un error: multiplicaba por cero y le enseñaba al admin
    // «Bs. 0.00» como si el plan fuera gratis. Es exactamente lo que
    // `TIPO_CAMBIO_POR_DEFECTO` existe para evitar, y es lo que hace el resto
    // del código; aquí se había escapado.
    tipo_cambio_usd: Number(config?.tipo_cambio_usd ?? TIPO_CAMBIO_POR_DEFECTO),
    proximo_cobro: clinica.proximo_cobro,
    estado_pago: clinica.estado_pago as EstadoPago,
    estado: clinica.estado as EstadoClinica,
  }
}

/**
 * El QR y las instrucciones de pago.
 *
 * Se pide aparte del tipo de cambio a propósito: el QR es una imagen en base64
 * y las pantallas de plataforma leen esa misma fila muchas veces solo para
 * convertir importes. `getConfiguracion()` selecciona sus columnas y no arrastra
 * esto.
 */
export async function getDatosDePago(): Promise<DatosDePago> {
  const { data, error } = await supabase
    .from('configuracion_plataforma')
    .select('qr_pago, datos_pago, tipo_cambio_usd')
    .maybeSingle()

  if (error || !data) {
    throw new Error(`No se pudieron leer los datos de pago: ${error?.message ?? 'sin configurar'}`)
  }
  return {
    qr_pago: data.qr_pago,
    datos_pago: data.datos_pago,
    tipo_cambio_usd: Number(data.tipo_cambio_usd),
  }
}

export async function listPagosDeClinica(): Promise<PagoSuscripcion[]> {
  const { data, error } = await supabase
    .from('pagos_suscripcion')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`No se pudieron cargar los comprobantes: ${error.message}`)
  return (data ?? []) as PagoSuscripcion[]
}

/** El bucket es privado: la URL se firma al mostrar y caduca en una hora. */
export async function urlFirmadaDeComprobante(ruta: string, segundos = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, segundos)
  if (error || !data) throw new Error(`No se pudo abrir el comprobante: ${error?.message ?? 'desconocido'}`)
  return data.signedUrl
}

/** Ya hay uno esperando revisión: enviar otro solo confunde a quien aprueba. */
export function hayComprobantePendiente(pagos: PagoSuscripcion[]): boolean {
  return pagos.some((p) => p.estado === 'pendiente')
}

export interface NuevoComprobanteInput {
  clinicaId: string
  meses: number
  /** Precio mensual pactado, en dólares. El total se calcula aquí. */
  precioMensualUsd: number
  tipoCambio: number
  archivo: File
  referencia: string
}

/**
 * Sube la foto y registra el comprobante.
 *
 * **El importe que llega aquí no es una garantía de nada.** Se calcula a partir
 * del precio y el tipo de cambio, pero los dos vienen del navegador, y la
 * policy `pagos_clinica_insert` valida `clinica_id`, `estado` y los campos de
 * revisión — no el dinero. Una petición fabricada puede declarar doce meses por
 * un dólar. **El control real es que el superadministrador mira la foto antes
 * de aprobar**, y por eso el importe se enseña junto a la imagen en
 * `ComprobanteModal`. Que nadie se apoye en esta cifra como si estuviera
 * verificada.
 */
export async function enviarComprobante(input: NuevoComprobanteInput): Promise<PagoSuscripcion> {
  if (!input.archivo.type.startsWith('image/')) {
    throw new Error('El comprobante debe ser una imagen (foto o captura)')
  }

  // Un comprobante a la vez. La garantía dura es el índice único parcial de
  // 0021 (`pagos_un_pendiente_por_clinica`); esto es el aviso temprano, para
  // que el admin lea una frase y no el error de duplicado de Postgres. Sin las
  // dos capas, dos envíos por la misma transferencia daban dos tareas idénticas
  // y aprobar las dos acreditaba el doble de meses.
  if (hayComprobantePendiente(await listPagosDeClinica())) {
    throw new Error('Ya tienes un comprobante en revisión. Espera a que lo aprobemos antes de enviar otro.')
  }
  if (!Number.isInteger(input.meses) || input.meses < 1) {
    throw new Error('Indica cuántos meses estás pagando')
  }
  if (!(input.tipoCambio > 0)) {
    throw new Error('La plataforma todavía no tiene un tipo de cambio configurado')
  }

  const montoUsd = Number((input.precioMensualUsd * input.meses).toFixed(2))
  const montoBs = usdABs(montoUsd, input.tipoCambio)

  // Una foto de móvil son varios MB y el bucket corta en 5.
  const comprimida = await redimensionarImagen(input.archivo)

  // La clínica va primera en la ruta: es lo que miran las policies de
  // `storage.objects` para aislar inquilinos.
  const ruta = `${input.clinicaId}/${crypto.randomUUID()}.jpg`

  const { error: errorSubida } = await supabase.storage
    .from(BUCKET)
    .upload(ruta, comprimida, { contentType: 'image/jpeg', upsert: false })

  if (errorSubida) throw new Error(`No se pudo subir el comprobante: ${errorSubida.message}`)

  const { data, error } = await supabase
    .from('pagos_suscripcion')
    .insert({
      meses: input.meses,
      monto_usd: montoUsd,
      tipo_cambio_usd: input.tipoCambio,
      monto_bs: montoBs,
      ruta_comprobante: ruta,
      referencia: input.referencia.trim(),
    })
    .select()
    .single()

  if (error || !data) {
    // El archivo ya está subido pero nada lo referencia: sin este borrado
    // quedaría ocupando cuota para siempre, invisible desde la aplicación.
    await supabase.storage.from(BUCKET).remove([ruta])
    throw new Error(`No se pudo registrar el comprobante: ${error?.message ?? 'desconocido'}`)
  }

  return data as PagoSuscripcion
}
