import { useState } from 'react'
import { Download } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Seccion } from '../components/ui/Seccion'
// `exportacion` arrastra JSZip. Con un `import` normal acaba en el bundle
// principal y lo descarga todo el mundo al abrir el login, para una pantalla
// que se usa de vez en cuando. Se carga al pulsar el botón.

export function RespaldoPage() {
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDescargar = async () => {
    try {
      setGenerando(true)
      setError(null)
      // Import dinámico a propósito: arrastra JSZip y file-saver, que no tienen
      // por qué entrar en el bundle inicial de quien nunca abre esta pantalla.
      // Va contra el SERVICIO, no contra `lib/exportacion` — las páginas no
      // hablan con Supabase ni con quien lo haga por ellas.
      const { generarRespaldo } = await import('../services/respaldo')
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
            {/* Esta lista decía seis archivos cuando el ZIP llevaba dieciocho, y
                hoy lleva 37. Se agrupa por área en vez de enumerar 37 nombres de
                tabla: quien lee esto quiere saber si su trabajo está dentro, no
                cómo se llaman las tablas. El recuento sí es exacto. */}
            <p className="text-sm text-slate-600">
              El archivo lleva <b>un CSV por cada una de las 37 tablas</b> de tu clínica, más las
              fotografías de las mascotas:
            </p>
            <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">
              <li>
                <b>Fichas</b> — clientes, pacientes y sus fotos.
              </li>
              <li>
                <b>Expediente clínico</b> — historial, recetas, vacunas, desparasitaciones,
                internaciones, consentimientos firmados e informes.
              </li>
              <li>
                <b>Agenda y caja</b> — citas, turnos, cobros y sus líneas.
              </li>
              <li>
                <b>Inventario</b> — productos, lotes, proveedores, órdenes de compra y movimientos.
              </li>
              <li>
                <b>Peluquería y Pet Shop</b> — órdenes, fichas, comisiones, servicios configurados,
                promociones y devoluciones.
              </li>
              <li>
                <b>Configuración</b> — sucursales, personal, servicios, vademécum y catálogo de la
                Tienda.
              </li>
              <li>
                Carpeta <b>fotos/</b> con las imágenes nombradas por código de mascota.
              </li>
            </ul>

            {/* Decirlo aquí y no solo en el código: quien guarda este ZIP creyendo
                que lleva sus radiografías se entera el día que las necesita. */}
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <b>Lo que el ZIP no lleva:</b> los archivos de los estudios de imagen, las fotos de
              peluquería y los comprobantes de pago. Esos viven en el almacenamiento y se descargan
              desde su propia pantalla; aquí viaja la ficha, no la imagen.
            </p>

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
