import JSZip from 'jszip'
import { supabase } from './supabase'

function parseCSV(csvText: string): any[] {
  if (!csvText.trim()) return []
  const lines = csvText.split('\n').map(l => l.trim()).filter(l => l)
  if (lines.length < 2) return []

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

  const ordenTablas = [
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
    'movimientos_inventario'
  ]

  const datosRestaurados: any = {}

  for (const tabla of ordenTablas) {
    const file = zip.file(`${tabla}.csv`)
    if (file) {
      const content = await file.async('text')
      datosRestaurados[tabla] = parseCSV(content)
    }
  }

  // Restaurar fotos
  const pacientesRestaurados = datosRestaurados['pacientes']
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

  // Realizar los upserts en la base de datos de Supabase en orden
  for (const tabla of ordenTablas) {
    const filasImportadas = datosRestaurados[tabla]
    if (filasImportadas && filasImportadas.length > 0) {
      // Limpiar propiedades que no van en BD (ej. tiene_foto)
      if (tabla === 'pacientes') {
        filasImportadas.forEach((p: any) => delete p.tiene_foto)
      }

      // Supabase upsert
      const { error } = await supabase.from(tabla as any).upsert(filasImportadas)
      if (error) {
        console.error(`Error importando ${tabla}:`, error)
      }
    }
  }
  
  return datosRestaurados
}
