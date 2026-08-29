import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, FileText, ImageIcon, Printer, Stethoscope, Pill, ShieldCheck } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { urlDescargaDe } from '../../services/estudios'
import { formatClinicDate } from '../../lib/datetime'
import { TIPO_DOCUMENTO_LABEL, type DocumentoPaciente, type TipoDocumento } from '../../lib/documentos'

const ICONO: Record<TipoDocumento, typeof FileText> = {
  historial: FileText,
  consulta: Stethoscope,
  receta: Pill,
  informe: FileText,
  consentimiento: ShieldCheck,
  estudio: ImageIcon,
}

const TONO: Record<TipoDocumento, 'teal' | 'slate' | 'emerald' | 'amber' | 'rose'> = {
  historial: 'slate',
  consulta: 'teal',
  receta: 'emerald',
  informe: 'slate',
  consentimiento: 'amber',
  estudio: 'rose',
}

/**
 * Todo lo que una mascota tiene en papel, en una sola lista.
 *
 * La lista la arma `documentosDePaciente()` (pura), así que esta pantalla solo
 * la pinta. Dos acciones según el documento: los imprimibles abren su página en
 * otra pestaña —donde el navegador ofrece «Guardar como PDF»— y los estudios de
 * imagen se descargan directamente.
 */
export function ListaDocumentos({ documentos }: { documentos: DocumentoPaciente[] }) {
  if (documentos.length === 0) {
    return (
      <Card className="border border-dashed border-slate-300 py-10 text-center">
        <p className="text-sm text-slate-400">
          Todavía no hay documentos. Aparecen aquí al cerrar una consulta, firmar un informe o adjuntar un
          estudio de imagen.
        </p>
      </Card>
    )
  }

  return (
    <Card className="p-0">
      <ul className="divide-y divide-slate-100">
        {documentos.map((doc) => {
          const Icono = ICONO[doc.tipo]
          return (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <Icono size={17} className="mt-0.5 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{doc.titulo}</p>
                    <Badge tone={TONO[doc.tipo]} size="sm">
                      {TIPO_DOCUMENTO_LABEL[doc.tipo]}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">{formatClinicDate(doc.fecha)}</p>
                </div>
              </div>
              <AccionDocumento doc={doc} />
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function AccionDocumento({ doc }: { doc: DocumentoPaciente }) {
  if (doc.href) {
    return (
      <Link
        to={doc.href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
      >
        <Printer size={13} /> Abrir e imprimir
      </Link>
    )
  }

  if (doc.ruta) return <BotonDescarga ruta={doc.ruta} nombre={doc.nombreArchivo ?? 'estudio.jpg'} />
  return null
}

/**
 * La URL de descarga se firma **al pulsar**, no al pintar la lista.
 *
 * El bucket es privado y la firma caduca en una hora: pedir una por cada
 * estudio al montar sería una ráfaga de peticiones para enlaces que casi nadie
 * abre, y encima podrían caducar mientras la pestaña sigue abierta.
 */
function BotonDescarga({ ruta, nombre }: { ruta: string; nombre: string }) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(false)

  async function descargar() {
    if (ocupado) return
    setOcupado(true)
    setError(false)
    try {
      // `Content-Disposition: attachment` hace que el navegador guarde el
      // archivo sin salir de esta página, así que no hace falta abrir pestaña.
      window.location.href = await urlDescargaDe(ruta, nombre)
    } catch {
      setError(true)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <button
      type="button"
      onClick={descargar}
      disabled={ocupado}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
    >
      <Download size={13} /> {error ? 'Reintentar' : ocupado ? 'Preparando…' : 'Descargar'}
    </button>
  )
}
