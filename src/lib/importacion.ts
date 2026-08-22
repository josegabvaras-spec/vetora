import JSZip from 'jszip'
import { supabase } from './supabase'

/**
 * Orden de restauración: las tablas que otras referencian van primero.
 *
 * Insertar una cita antes que su paciente revienta con un 23503 de clave
 * foránea, así que este orden no es cosmético.
 */
export const ORDEN_IMPORTACION = [
  'clientes',
  'pacientes',
  'productos',
  'turnos_caja',
  'citas',
  'historial_clinico',
  'internaciones',
  'notas_internacion',
  'cobros',
  'cobro_lineas',
  'movimientos_inventario',
] as const

/**
 * Deduce el separador leyendo la cabecera.
 *
 * Los respaldos nuevos salen con `;` (Excel en español), pero los que ya se
 * descargaron llevan coma. Detectarlo evita que un archivo antiguo se importe
 * como una sola columna gigante y sin dar error.
 *
 * Se cuentan solo los caracteres fuera de comillas: un nombre como
 * «Pérez, Juan» dentro de un campo entrecomillado no es un separador.
 */
function detectarSeparador(cabecera: string): string {
  let puntoYComa = 0
  let comas = 0
  let enComillas = false

  for (const char of cabecera) {
    if (char === '"') enComillas = !enComillas
    else if (!enComillas && char === ';') puntoYComa++
    else if (!enComillas && char === ',') comas++
  }

  return puntoYComa >= comas ? ';' : ','
}

function parseCSV(csvText: string): any[] {
  if (!csvText.trim()) return []
  const lines = csvText.split('\n').map((l) => l.trim()).filter((l) => l)
  if (lines.length < 2) return []

  const separador = detectarSeparador(lines[0])

  const parseLine = (line: string) => {
    const result = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === separador && !inQuotes) {
        result.push(current)
        current = ''
      } else {
        current += char
      }
    }
    result.push(current)
    return result
  }

  const headers = parseLine(lines[0])
  const result = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i])
    const obj: any = {}
    headers.forEach((header, index) => {
      const val = values[index]
      if (val === 'null' || val === '' || val === undefined) obj[header] = null
      else if (val === 'true') obj[header] = true
      else if (val === 'false') obj[header] = false
      // Ojo: solo se convierte a número lo que NO parece un identificador. Un
      // código como "0012" perdería sus ceros al pasar por Number().
      else if (!isNaN(Number(val)) && !/^0\d/.test(val)) obj[header] = Number(val)
      else obj[header] = val
    })
    result.push(obj)
  }

  return result
}

/** Lee el ZIP y devuelve las filas por tabla, con las fotos ya reincorporadas. */
export async function leerZip(file: File): Promise<Record<string, any[]>> {
  const zip = new JSZip()
  await zip.loadAsync(file)

  const datosRestaurados: Record<string, any[]> = {}

  for (const tabla of ORDEN_IMPORTACION) {
    const archivo = zip.file(`${tabla}.csv`)
    if (archivo) {
      datosRestaurados[tabla] = parseCSV(await archivo.async('text'))
    }
  }

  // Las fotos vuelven a su fila: en el CSV solo viajaba `tiene_foto`.
  const pacientesRestaurados = datosRestaurados['pacientes']
  if (pacientesRestaurados) {
    const folder = zip.folder('fotos')
    if (folder) {
      for (const paciente of pacientesRestaurados) {
        if (paciente.codigo) {
          const fotoFile = folder.file(`${paciente.codigo}.jpg`)
          if (fotoFile) {
            paciente.foto = `data:image/jpeg;base64,${await fotoFile.async('base64')}`
          }
        }
      }
    }
    // Columna del CSV, no de la base: si viaja al upsert, Postgres la rechaza.
    pacientesRestaurados.forEach((p: any) => delete p.tiene_foto)
  }

  return datosRestaurados
}

/** Restauración que hace la propia clínica; la RLS acota dónde puede escribir. */
export async function importarRespaldo(file: File) {
  const datosRestaurados = await leerZip(file)
  const fallidas: string[] = []

  for (const tabla of ORDEN_IMPORTACION) {
    const filas = datosRestaurados[tabla]
    if (!filas || filas.length === 0) continue

    const { error } = await supabase.from(tabla as any).upsert(filas)
    // Antes esto solo hacía `console.error`: la pantalla decía «importado» aunque
    // no hubiera entrado una sola fila.
    if (error) fallidas.push(`${tabla} (${error.message})`)
  }

  if (fallidas.length > 0) {
    throw new Error(`No se pudieron importar algunas tablas: ${fallidas.join('; ')}`)
  }

  return datosRestaurados
}
