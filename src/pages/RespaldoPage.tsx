import { useState } from 'react'
import { Download } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Seccion } from '../components/ui/Seccion'
import { generarRespaldo } from '../lib/exportacion'

export function RespaldoPage() {
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDescargar = async () => {
    try {
      setGenerando(true)
      setError(null)
      await generarRespaldo()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar el respaldo')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Respaldo de Datos</h1>
          <p className="text-sm text-slate-500">
            Descarga un respaldo completo de los pacientes, clientes, métricas y finanzas.
          </p>
        </div>
      </div>

      <Card>
        <Seccion titulo="Descargar Archivo ZIP">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              El archivo incluirá datos en formato CSV y las fotografías de las mascotas guardadas.
              Al exportar se generarán los siguientes archivos:
            </p>
            <ul className="list-disc pl-5 text-sm text-slate-600">
              <li>clientes.csv</li>
              <li>pacientes.csv</li>
              <li>citas.csv</li>
              <li>historial_clinico.csv</li>
              <li>cobros.csv y cobro_lineas.csv</li>
              <li>turnos_caja.csv</li>
              <li>Carpeta <b>fotos/</b> con las imágenes nombradas por código de mascota.</li>
            </ul>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <Button onClick={handleDescargar} disabled={generando}>
                <Download size={16} />
                {generando ? 'Generando Respaldo...' : 'Descargar Respaldo'}
              </Button>
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>
        </Seccion>
      </Card>
    </div>
  )
}
