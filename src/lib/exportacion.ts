import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { db } from '../mocks/db'
import type { Paciente } from '../types/database'
import type { Tables } from '../mocks/db'

function objectToCSV(data: any[]): string {
  if (data.length === 0) return ''
  const headers = Object.keys(data[0])
  const csvRows = []
  
  csvRows.push(headers.join(','))
  
  for (const row of data) {
    const values = headers.map(header => {
      const escaped = ('' + (row[header] ?? '')).replace(/"/g, '""')
      return `"${escaped}"`
    })
    csvRows.push(values.join(','))
  }
  
  return csvRows.join('\n')
}

export async function generarRespaldo() {
  const zip = new JSZip()
  
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

  // Agregar CSVs
  for (const tabla of tablas) {
    const data = db.get(tabla as keyof Tables) as any[]
    
    // Para pacientes, no incluimos la cadena base64 en el CSV para ahorrar espacio
    const exportData = tabla === 'pacientes' 
      ? data.map(p => {
          const { foto, ...rest } = p
          return { ...rest, tiene_foto: !!foto }
        })
      : data
      
    const csvContent = objectToCSV(exportData)
    zip.file(`${tabla}.csv`, csvContent)
  }

  // Agregar Fotos
  const pacientes = db.get('pacientes') as unknown as Paciente[]
  const fotosFolder = zip.folder('fotos')
  
  if (fotosFolder) {
    for (const paciente of pacientes) {
      if (paciente.foto && paciente.codigo) {
        // foto se espera que sea un base64 data URL: data:image/jpeg;base64,...
        const partes = paciente.foto.split(',')
        const base64Data = partes.length > 1 ? partes[1] : partes[0]
        if (base64Data) {
          fotosFolder.file(`${paciente.codigo}.jpg`, base64Data, { base64: true })
        }
      }
    }
  }

  const content = await zip.generateAsync({ type: 'blob' })
  saveAs(content, `respaldo_${new Date().toISOString().split('T')[0]}.zip`)
}
