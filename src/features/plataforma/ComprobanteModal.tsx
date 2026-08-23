import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Textarea } from '../../components/ui/Field'
import { aprobarPago, rechazarPago, type PagoConClinica } from '../../services/plataforma'
import { urlFirmadaDeComprobante } from '../../services/facturacion'
import { formatBs, formatUsd } from '../../lib/currency'
import { formatClinicDateTime, sumarMesesAFecha } from '../../lib/datetime'

/**
 * Revisión de un comprobante de suscripción.
 *
 * Es la contrapartida de la pantalla de Facturación de la clínica: ella sube la
 * foto y aquí se decide. Aprobar marca el pago y corre la fecha del próximo
 * cobro **en una sola sentencia** (`aprobar_pago_suscripcion`, migración 0021):
 * antes eran tres viajes y un fallo a medias dejaba el pago aprobado con la
 * fecha sin mover, sin rastro y sin forma de reintentar.
 */
export function ComprobanteModal({
  pago,
  revisorId,
  onClose,
  onRevisado,
}: {
  pago: PagoConClinica
  revisorId: string
  onClose: () => void
  onRevisado: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // El bucket es privado: la URL se firma al abrir y caduca. Guardarla sería
    // guardar una llave con fecha de caducidad.
    urlFirmadaDeComprobante(pago.ruta_comprobante)
      .then(setUrl)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo abrir el comprobante'))
  }, [pago.ruta_comprobante])

  async function ejecutar(accion: () => Promise<void>) {
    setOcupado(true)
    setError(null)
    try {
      await accion()
      onRevisado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la revisión')
      setOcupado(false)
    }
  }

  return (
    <Modal title={`Comprobante de ${pago.clinica_nombre}`} onClose={onClose} widthClassName="max-w-2xl">
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Importe</dt>
            <dd className="font-display font-black text-slate-900">{formatUsd(pago.monto_usd)}</dd>
            <dd className="text-xs text-slate-400">{formatBs(pago.monto_bs)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Cubre</dt>
            <dd className="font-semibold text-slate-800">
              {pago.meses} {pago.meses === 1 ? 'mes' : 'meses'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Operación</dt>
            <dd className="font-semibold text-slate-800">{pago.referencia || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Enviado</dt>
            <dd className="text-slate-800">{formatClinicDateTime(pago.created_at)}</dd>
          </div>
        </dl>

        {/* A qué fecha se moverá el cobro, antes de pulsar y no después. */}
        {pago.proximo_cobro && (
          <p className="rounded-lg border border-teal-100 bg-teal-50/60 p-3 text-sm text-slate-700">
            Al aprobarlo, el próximo cobro pasa del{' '}
            <span className="font-semibold">{pago.proximo_cobro.slice(8, 10)}/{pago.proximo_cobro.slice(5, 7)}/{pago.proximo_cobro.slice(0, 4)}</span>{' '}
            al{' '}
            <span className="font-semibold text-teal-800">
              {(() => {
                const d = sumarMesesAFecha(pago.proximo_cobro, pago.meses)
                return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
              })()}
            </span>
            . Si esa fecha ya es futura, la clínica queda al día; si sigue atrasada, este pago no
            salda toda la deuda y la cuenta permanece en mora.
          </p>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {url ? (
            <img src={url} alt="Comprobante de pago" className="max-h-[55vh] w-full object-contain" />
          ) : (
            <p className="py-16 text-center text-sm text-slate-400">
              {error ? 'No se pudo cargar la imagen.' : 'Cargando comprobante…'}
            </p>
          )}
        </div>

        {rechazando && (
          <FieldGroup label="¿Por qué se rechaza?">
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Ej. El importe no coincide con lo acordado, o la imagen no se lee."
            />
            {/* No es una nota interna: aparece en el historial de la clínica. */}
            <p className="mt-1 text-xs text-slate-500">La clínica va a leer esto en su pantalla de Facturación.</p>
          </FieldGroup>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
          {rechazando ? (
            <>
              <Button variant="secondary" onClick={() => setRechazando(false)} disabled={ocupado}>
                Volver
              </Button>
              <Button
                variant="danger"
                disabled={ocupado || !motivo.trim()}
                onClick={() => ejecutar(() => rechazarPago(pago.id, motivo, revisorId))}
              >
                <XCircle size={16} /> {ocupado ? 'Rechazando…' : 'Confirmar rechazo'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setRechazando(true)} disabled={ocupado}>
                <XCircle size={16} /> Rechazar
              </Button>
              <Button
                variant="success"
                disabled={ocupado}
                onClick={() => ejecutar(async () => { await aprobarPago(pago) })}
              >
                <CheckCircle2 size={16} /> {ocupado ? 'Aprobando…' : 'Aprobar y renovar'}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
