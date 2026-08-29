import { supabase } from '../lib/supabase'
import { redimensionarImagen } from '../lib/imagen'

/**
 * Estudios de imagen (ecografía, rayos X) adjuntos a una consulta.
 *
 * Los archivos viven en el bucket privado `estudios` de Supabase Storage y solo
 * los metadatos en Postgres (migración 0016). Nunca se guarda la imagen en la
 * base: una radiografía en base64 engorda la fila varios MB y `useTable` se
 * trae las tablas enteras.
 */

const BUCKET = 'estudios'

export type TipoEstudio = 'ecografia' | 'radiografia' | 'otro'

export interface EstudioImagen {
  id: string
  clinica_id: string
  historial_id: string
  paciente_id: string
  ruta: string
  tipo: TipoEstudio
  descripcion: string
  created_at: string
}

export const TIPO_ESTUDIO_LABEL: Record<TipoEstudio, string> = {
  ecografia: 'Ecografía',
  radiografia: 'Radiografía',
  otro: 'Otro estudio',
}

export async function listEstudiosDePaciente(pacienteId: string): Promise<EstudioImagen[]> {
  const { data, error } = await supabase
    .from('estudios_imagen')
    .select('*')
    .eq('paciente_id', pacienteId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`No se pudieron cargar los estudios: ${error.message}`)
  return (data ?? []) as EstudioImagen[]
}

/**
 * URL temporal para mostrar la imagen.
 *
 * El bucket es privado, así que no hay URL permanente: se firma al renderizar y
 * caduca en una hora. Guardarla en la base sería guardar una llave con fecha de
 * caducidad.
 */
export async function urlFirmadaDe(ruta: string, segundos = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, segundos)
  if (error || !data) throw new Error(`No se pudo abrir la imagen: ${error?.message ?? 'desconocido'}`)
  return data.signedUrl
}

/**
 * URL temporal que **guarda** el archivo en vez de abrirlo.
 *
 * Es la misma firma que `urlFirmadaDe`, pero con la opción `download`, que hace
 * que Storage devuelva el `Content-Disposition: attachment`. Sin eso, un `<a>`
 * hacia una imagen la abre en otra pestaña y el dueño tiene que saber pulsar
 * «guardar imagen como» — que en un celular no es evidente.
 *
 * El nombre lo compone `nombreDeArchivo()` de `lib/documentos`: viaja en una
 * cabecera HTTP, así que va sin acentos ni espacios.
 */
export async function urlDescargaDe(ruta: string, nombre: string, segundos = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(ruta, segundos, { download: nombre })
  if (error || !data) throw new Error(`No se pudo preparar la descarga: ${error?.message ?? 'desconocido'}`)
  return data.signedUrl
}

export async function subirEstudio(
  clinicaId: string,
  pacienteId: string,
  historialId: string,
  archivo: File,
  tipo: TipoEstudio,
  descripcion: string,
): Promise<EstudioImagen> {
  if (!archivo.type.startsWith('image/')) {
    throw new Error('El archivo debe ser una imagen')
  }

  const comprimida = await redimensionarImagen(archivo)

  // La clínica va primera en la ruta: es lo que las policies de
  // `storage.objects` miran para aislar inquilinos.
  const ruta = `${clinicaId}/${pacienteId}/${crypto.randomUUID()}.jpg`

  const { error: errorSubida } = await supabase.storage
    .from(BUCKET)
    .upload(ruta, comprimida, { contentType: 'image/jpeg', upsert: false })

  if (errorSubida) throw new Error(`No se pudo subir la imagen: ${errorSubida.message}`)

  const { data, error } = await supabase
    .from('estudios_imagen')
    .insert({
      historial_id: historialId,
      paciente_id: pacienteId,
      ruta,
      tipo,
      descripcion: descripcion.trim(),
    })
    .select()
    .single()

  if (error || !data) {
    // El archivo ya está subido pero nada lo referencia: sin este borrado
    // quedaría ocupando cuota para siempre, invisible desde la aplicación.
    await supabase.storage.from(BUCKET).remove([ruta])
    throw new Error(`No se pudo registrar el estudio: ${error?.message ?? 'desconocido'}`)
  }

  return data as EstudioImagen
}

/**
 * Borra la fila y después el archivo.
 *
 * En ese orden a propósito: la fila la protege la RLS (solo en borrador), así
 * que si la policy rechaza el borrado el archivo sigue intacto. Al revés se
 * habría perdido la imagen de una consulta ya cerrada.
 */
export async function eliminarEstudio(estudio: EstudioImagen): Promise<void> {
  const { data, error } = await supabase
    .from('estudios_imagen')
    .delete()
    .eq('id', estudio.id)
    .select('id')

  if (error) throw new Error(`No se pudo eliminar el estudio: ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error('No se pudo eliminar: la consulta ya está cerrada o no tienes permiso')
  }

  const { error: errorArchivo } = await supabase.storage.from(BUCKET).remove([estudio.ruta])
  if (errorArchivo) {
    throw new Error(`El estudio se quitó de la consulta, pero el archivo quedó en el servidor: ${errorArchivo.message}`)
  }
}
