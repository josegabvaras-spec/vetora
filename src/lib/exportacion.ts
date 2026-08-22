import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { supabase } from './supabase'

/**
 * Punto y coma, no coma.
 *
 * Excel decide cómo partir un CSV según la configuración regional del sistema:
 * en español el separador de lista es `;`, así que un archivo con comas se abre
 * entero en la primera columna. Es el formato que de verdad se usa aquí, no una
 * preferencia.
 *
 * `importacion.ts` detecta el separador al leer, así que los respaldos que ya
 * se hayan descargado con coma siguen importándose.
 */
export const SEPARADOR_CSV = ';'

/** Tablas operativas de una clínica. El orden aquí no importa; al importar, sí. */
export const TABLAS_RESPALDO = [
  'clientes',
  'pacientes',
  'citas',
  'historial_clinico',
  'cobros',
  'cobro_lineas',
  'turnos_caja',
  'productos',
  'movimientos_inventario',
  'internaciones',
  'notas_internacion',
] as const

function objectToCSV(data: any[]): string {
  if (data.length === 0) return ''
  const headers = Object.keys(data[0])
  const csvRows = []

  csvRows.push(headers.join(SEPARADOR_CSV))

  for (const row of data) {
    const values = headers.map((header) => {
      const escaped = ('' + (row[header] ?? '')).replace(/"/g, '""')
      return `"${escaped}"`
    })
    csvRows.push(values.join(SEPARADOR_CSV))
  }

  return csvRows.join('\n')
}

/**
 * Arma el ZIP a partir de datos ya leídos.
 *
 * Separado de la lectura porque hay dos formas de obtenerlos: la clínica los
 * consulta con su propia sesión (la RLS la acota), y la plataforma los pide a
 * la Edge Function `respaldo-clinica`, que usa `service_role` porque el
 * superadmin no puede leer datos clínicos por diseño.
 */
export async function construirZip(datosPorTabla: Record<string, any[]>): Promise<Blob> {
  const zip = new JSZip()
  const pacientesData = datosPorTabla['pacientes'] ?? []

  for (const tabla of TABLAS_RESPALDO) {
    const data = datosPorTabla[tabla]
    if (!data) continue

    // La foto sale del CSV: es una cadena base64 de cientos de KB que dejaría
    // la hoja ilegible. Va aparte, en `fotos/`, y el CSV solo dice si la hay.
    const exportData =
      tabla === 'pacientes'
        ? data.map((p: any) => {
            const { foto, ...rest } = p
            return { ...rest, tiene_foto: !!foto }
          })
        : data

    zip.file(`${tabla}.csv`, objectToCSV(exportData))
  }

  // Solo las fotos de los pacientes, que ya vienen en memoria dentro de su
  // propia fila. Los estudios de imagen (0016) NO entran: viven en Supabase
  // Storage y habría que descargarlos uno a uno, cientos de MB en una sola
  // operación del navegador.
  const fotosFolder = zip.folder('fotos')

  if (fotosFolder) {
    for (const paciente of pacientesData) {
      if (paciente.foto && paciente.codigo) {
        // Se espera un data URL: data:image/jpeg;base64,...
        const partes = String(paciente.foto).split(',')
        const base64Data = partes.length > 1 ? partes[1] : partes[0]
        if (base64Data) {
          fotosFolder.file(`${paciente.codigo}.jpg`, base64Data, { base64: true })
        }
      }
    }
  }

  return zip.generateAsync({ type: 'blob' })
}

export function descargarZip(contenido: Blob, nombre: string): void {
  saveAs(contenido, nombre)
}

/** Respaldo que se descarga la propia clínica; la RLS acota lo que ve. */
export async function generarRespaldo() {
  const datosPorTabla: Record<string, any[]> = {}

  for (const tabla of TABLAS_RESPALDO) {
    const { data, error } = await supabase.from(tabla as any).select('*')
    if (error || !data) continue
    datosPorTabla[tabla] = data
  }

  const contenido = await construirZip(datosPorTabla)
  descargarZip(contenido, `respaldo_${new Date().toISOString().split('T')[0]}.zip`)
}
