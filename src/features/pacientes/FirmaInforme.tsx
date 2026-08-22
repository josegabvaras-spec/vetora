import { useEffect, useState } from 'react'
import { PenLine, Printer } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { FirmarInformeModal } from './FirmarInformeModal'
import { getFirmaInforme, type InformeFirmado, type TipoInforme } from '../../services/informes'
import { formatClinicDateTime } from '../../lib/datetime'

/**
 * Puerta de impresión de los informes: no se imprime lo que no está firmado.
 *
 * Se comparte entre el historial completo y los informes específicos porque la
 * regla es la misma; lo que cambia entre esas pantallas es el documento, no el
 * trámite. El esqueleto de impresión sí se copia en cada página (así está el
 * resto del proyecto): aquí solo vive el candado.
 */
export function AccionesFirmaInforme({
  pacienteId,
  tipo,
  itemId,
  tituloDocumento,
  nombreTutor,
  etiquetaTutor,
  etiquetaFirmante,
  firma,
  onFirmado,
}: {
  /** Null solo en recibos: la venta de mostrador no tiene ficha de paciente. */
  pacienteId: string | null
  tipo: TipoInforme
  itemId: string | null
  tituloDocumento: string
  nombreTutor: string
  etiquetaTutor?: string
  etiquetaFirmante?: string
  firma: InformeFirmado | null | undefined
  onFirmado: (firma: InformeFirmado) => void
}) {
  const [firmando, setFirmando] = useState(false)

  return (
    // En celular los botones van uno debajo del otro y a todo lo ancho: en fila
    // quedaban dos cajas estrechas con el texto partido en tres líneas.
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
      {firma ? (
        <>
          <Button variant="secondary" onClick={() => setFirmando(true)}>
            <PenLine size={16} /> Volver a firmar
          </Button>
          <Button onClick={() => window.print()}>
            <Printer size={16} /> Imprimir / Guardar PDF
          </Button>
        </>
      ) : (
        <>
          {/* Deshabilitado en vez de oculto: si el botón desapareciera, quien
              busca imprimir no sabría que lo que falta es firmar. */}
          <Button variant="danger" onClick={() => setFirmando(true)} disabled={firma === undefined}>
            <PenLine size={16} /> Firmar para imprimir
          </Button>
          <Button disabled>
            <Printer size={16} /> Imprimir / Guardar PDF
          </Button>
        </>
      )}

      {firmando && (
        <FirmarInformeModal
          pacienteId={pacienteId}
          tipo={tipo}
          itemId={itemId}
          tituloDocumento={tituloDocumento}
          nombreTutor={nombreTutor}
          etiquetaTutor={etiquetaTutor}
          etiquetaFirmante={etiquetaFirmante}
          onClose={() => setFirmando(false)}
          onFirmado={(nueva) => {
            setFirmando(false)
            onFirmado(nueva)
          }}
        />
      )}
    </div>
  )
}

/**
 * Bloque de firmas del documento impreso.
 *
 * Las imágenes se dibujan **encima** de la raya, no en su lugar: el papel tiene
 * que verse igual con trazo y sin él.
 */
export function FirmasInformeImpresas({
  firma,
  etiquetaTutor = 'Firma del Propietario/a',
  etiquetaFirmante = 'Firma Médico Veterinario',
}: {
  firma: InformeFirmado | null | undefined
  etiquetaTutor?: string
  etiquetaFirmante?: string
}) {
  return (
    <section className="mt-10 break-inside-avoid">
      <div className="grid grid-cols-2 gap-10 text-center text-sm">
        <div>
          <div className="flex h-16 items-end justify-center print:h-14">
            {firma?.firma_tutor && (
              <img src={firma.firma_tutor} alt={etiquetaTutor} className="max-h-16 object-contain" />
            )}
          </div>
          <div className="mb-1 border-t border-slate-400 pt-2 text-[11px] font-bold text-slate-800">
            {etiquetaTutor}
          </div>
          {firma?.nombre_tutor && <p className="text-[10px] text-slate-600">{firma.nombre_tutor}</p>}
        </div>
        <div>
          <div className="flex h-16 items-end justify-center print:h-14">
            {firma?.firma_veterinario && (
              <img src={firma.firma_veterinario} alt={etiquetaFirmante} className="max-h-16 object-contain" />
            )}
          </div>
          <div className="mb-1 border-t border-slate-400 pt-2 text-[11px] font-bold text-slate-800">
            {etiquetaFirmante}
          </div>
          {firma?.nombre_veterinario && (
            <p className="text-[10px] text-slate-600">{firma.nombre_veterinario}</p>
          )}
        </div>
      </div>

      {firma && (
        <p className="mt-4 text-center text-[10px] text-slate-400">
          Firmado electrónicamente el {formatClinicDateTime(firma.created_at)} · Referencia {firma.id}
        </p>
      )}
    </section>
  )
}

/**
 * Carga la firma vigente del documento.
 *
 * `undefined` mientras se consulta y `null` cuando no hay ninguna: con un solo
 * valor, la pantalla enseñaría «sin firmar» durante la carga y el botón de
 * firmar parpadearía en cada apertura.
 */
export function useFirmaInforme(
  pacienteId: string | null | undefined,
  tipo: TipoInforme,
  itemId: string | null,
) {
  const [firma, setFirma] = useState<InformeFirmado | null | undefined>(undefined)

  useEffect(() => {
    // Hace falta al menos un identificador. Los recibos van sin paciente y se
    // localizan por su cobro (`itemId`); el resto, al revés.
    if (!pacienteId && !itemId) return
    let montado = true
    getFirmaInforme(pacienteId ?? null, tipo, itemId)
      .then((f) => {
        if (montado) setFirma(f)
      })
      .catch(() => {
        if (montado) setFirma(null)
      })
    return () => { montado = false }
  }, [pacienteId, tipo, itemId])

  return { firma, setFirma }
}
