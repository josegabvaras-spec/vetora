import { supabase } from '../lib/supabase'

/**
 * Respaldo de una clínica desde el panel de plataforma.
 *
 * Pasa por la Edge Function `respaldo-clinica` y no por consultas directas
 * porque **el superadmin no puede leer datos clínicos**: su `clinica_id` es
 * null y la RLS le devuelve vacío en todas esas tablas. Eso es deliberado y no
 * se relaja; la función usa `service_role` acotado a una clínica concreta.
 *
 * El ZIP se arma y se lee en el navegador, reutilizando el mismo código que el
 * respaldo que se descarga la propia clínica: así los dos producen exactamente
 * el mismo formato y un archivo sirve para las dos vías.
 */

async function invocar(cuerpo: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke<{
    clinica?: string
    tablas?: Record<string, any[]>
    error?: string
    ok?: boolean
  }>('respaldo-clinica', { body: cuerpo })

  // `invoke` da un error genérico cuando la función responde 4xx/5xx; el motivo
  // real viene en el cuerpo, así que se prefiere ese.
  if (data?.error) throw new Error(data.error)
  if (error) throw new Error(`No se pudo contactar con el servicio de respaldo: ${error.message}`)
  if (!data) throw new Error('El servicio de respaldo no devolvió nada')
  return data
}

/**
 * `exportacion` e `importacion` se cargan bajo demanda porque arrastran JSZip,
 * que pesa lo suyo. Con un `import` normal acabaría en el bundle principal y lo
 * descargaría todo el mundo al abrir el login, para una pantalla que solo usa
 * el superadmin de vez en cuando.
 */
export async function exportarClinica(clinicaId: string): Promise<void> {
  const { clinica, tablas } = await invocar({ accion: 'exportar', clinicaId })
  if (!tablas) throw new Error('El respaldo llegó vacío')

  const { construirZip, descargarZip } = await import('../lib/exportacion')
  const contenido = await construirZip(tablas)
  // El nombre lleva la clínica: quien administra varias acaba con varios ZIP en
  // la carpeta de descargas y por fecha sola no se distinguen.
  const limpio = (clinica ?? 'clinica').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
  descargarZip(contenido, `respaldo_${limpio}_${new Date().toISOString().split('T')[0]}.zip`)
}

export async function importarEnClinica(clinicaId: string, archivo: File): Promise<void> {
  const { leerZip } = await import('../lib/importacion')
  const tablas = await leerZip(archivo)

  const filas = Object.values(tablas).reduce((n, t) => n + t.length, 0)
  if (filas === 0) throw new Error('El archivo no contiene ninguna fila que importar')

  await invocar({ accion: 'importar', clinicaId, tablas })
}
