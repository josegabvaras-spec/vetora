import JSZip from 'jszip'
import { db } from '../mocks/db'
import type { Tables } from '../mocks/db'
import type { Paciente } from '../types/database'

function parseCSV(csvText: string): any[] {
  if (!csvText.trim()) return []
  const lines = csvText.split('\n').map(l => l.trim()).filter(l => l)
  if (lines.length < 2) return []

  // Simple CSV parser (not handling commas inside quotes properly if they exist, but sufficient for this MVP)
  // Better approach: split by comma but ignore commas inside quotes.
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
      } else if (char === ',' && !inQuotes) {
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
      let val = values[index]
      if (val === 'null' || val === '') obj[header] = null
      else if (val === 'true') obj[header] = true
      else if (val === 'false') obj[header] = false
      else if (!isNaN(Number(val)) && val !== '') obj[header] = Number(val)
      else obj[header] = val
    })
    result.push(obj)
  }

  return result
}

export async function importarRespaldo(file: File) {
  const zip = new JSZip()
  await zip.loadAsync(file)

  const tablas: (keyof Tables)[] = [
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
    'notas_internacion'
  ]

  const datosRestaurados: Partial<Tables> = {}

  for (const tabla of tablas) {
    const file = zip.file(`${tabla}.csv`)
    if (file) {
      const content = await file.async('text')
      datosRestaurados[tabla] = parseCSV(content) as any
    }
  }

  // Restaurar fotos
  const pacientesRestaurados = datosRestaurados['pacientes'] as Paciente[] | undefined
  if (pacientesRestaurados) {
    const folder = zip.folder('fotos')
    if (folder) {
      for (const paciente of pacientesRestaurados) {
        if (paciente.codigo) {
          const fotoFile = folder.file(`${paciente.codigo}.jpg`)
          if (fotoFile) {
            const base64Data = await fotoFile.async('base64')
            paciente.foto = `data:image/jpeg;base64,${base64Data}`
          }
        }
      }
    }
  }

  // Guardar en la base de datos simulada
  // El superadmin guarda directamente. Como es una importación,
  // vamos a actualizar el store global. En un escenario real, esto se hace
  // mediante un endpoint backend o múltiples inserts.
  for (const tabla of tablas) {
    const filasImportadas = datosRestaurados[tabla]
    if (filasImportadas) {
      // Omitimos la verificación de clinicaActiva porque el superadmin
      // opera a nivel global. Necesitamos usar un bypass en db.ts o
      // temporalmente saltarnos la validación de clínica.
      // El db.set actual valida que haya clinicaActiva, pero el superadmin no tiene.
      // Así que actualizaremos directamente el localStorage o crearemos un método especial.
      
      const currentData = db.getGlobal(tabla) as any[]
      // Merge: replace existing rows by id, add new ones
      const idMap = new Map(currentData.map(row => [row.id, row]))
      for (const row of filasImportadas) {
        idMap.set(row.id, row)
      }
      db.setGlobal(tabla, Array.from(idMap.values()) as any)
    }
  }
  
  return datosRestaurados
}
