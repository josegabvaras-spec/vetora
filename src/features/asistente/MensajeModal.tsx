import { useEffect, useState } from 'react'
import { MessageCircle, RefreshCw, Sparkles } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Textarea } from '../../components/ui/Field'
import { redactarAviso, redactarAvisoInterno, type Redaccion } from '../../services/asistente'
import { enviarAviso } from '../../services/programados'
import { TIPO_AVISO_LABEL, cuandoLegible } from '../../lib/asistente'
import type { Programado } from '../../types/views'

import { useAuth } from '../../context/useAuth'

/**
 * Revisar y enviar un aviso. El texto llega redactado pero **editable**: quien
 * atiende conoce al cliente y el asistente no, así que la última palabra es
 * suya. Nada sale de aquí sin que alguien lo lea.
 */
export function MensajeModal({
  aviso,
  destino = 'cliente',
  onClose,
  onEnviado,
}: {
  aviso: Programado
  destino?: 'cliente' | 'equipo'
  onClose: () => void
  onEnviado: () => void
}) {
  const { usuario } = useAuth()
  const [redaccion, setRedaccion] = useState<Redaccion | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function redactar() {
    setRedaccion(null)
    setError(null)
    try {
      const resultado = destino === 'equipo' ? await redactarAvisoInterno(aviso) : await redactarAviso(aviso)
      setRedaccion(resultado)
      setTexto(resultado.texto)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo redactar el mensaje')
    }
  }

  useEffect(() => {
    redactar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aviso.id])

  async function enviar() {
    if (!usuario?.clinica_id) return
    setEnviando(true)
    setError(null)

    // La pestaña se abre AHORA, dentro del gesto del clic, y se le pone la
    // dirección después.
    //
    // Con `window.open` detrás del `await` el navegador ya no lo asocia a una
    // acción del usuario y lo bloquea como popup — pero para entonces
    // `enviarAviso` ya consumió una unidad de la cuota mensual del plan y marcó
    // la cita como avisada. El mensaje no salía, el aviso desaparecía de
    // pendientes y nadie se enteraba.
    //
    // Sin `noopener` a propósito: con esa opción `window.open` devuelve null
    // por especificación y no habría handle que redirigir. Se anula el opener
    // a mano, que da la misma garantía.
    const ventana = window.open('', '_blank')
    if (ventana) ventana.opener = null

    try {
      const enlace = await enviarAviso(usuario.clinica_id, { ...aviso, whatsapp: destino === 'equipo' ? '' : aviso.whatsapp }, texto, destino)

      if (ventana) {
        ventana.location.href = enlace
      } else {
        // Popup bloqueado. La cuota ya se gastó, así que lo que no puede pasar
        // es quedarse sin abrir el mensaje: se navega en la misma pestaña.
        window.location.href = enlace
      }
      onEnviado()
    } catch (err) {
      ventana?.close()
      setError(err instanceof Error ? err.message : 'No se pudo enviar el mensaje')
      setEnviando(false)
    }
  }

  return (
    <Modal title={`${TIPO_AVISO_LABEL[aviso.tipo]} (${destino === 'equipo' ? 'Equipo' : 'Cliente'})`} onClose={onClose} widthClassName="max-w-xl">
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-bold text-slate-900">
            {aviso.paciente_nombre}
            <span className="font-medium text-slate-500"> · {aviso.cliente_nombre}</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {aviso.detalle} — {cuandoLegible(aviso)}
          </p>
        </div>

        {redaccion === null && !error ? (
          <div className="flex items-center gap-3 py-8 text-sm text-slate-400">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600" />
            Redactando el mensaje…
          </div>
        ) : (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Mensaje
              </span>
              {redaccion && (
                <div className="flex items-center gap-2">
                  <Badge tone={redaccion.origen === 'ia' ? 'teal' : 'slate'} size="sm">
                    {redaccion.origen === 'ia' ? (
                      <>
                        <Sparkles size={11} className="mr-1" /> Redactado con IA
                      </>
                    ) : (
                      'Plantilla del sistema'
                    )}
                  </Badge>
                  <button
                    onClick={redactar}
                    className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-slate-500 hover:text-teal-700"
                  >
                    <RefreshCw size={12} /> Rehacer
                  </button>
                </div>
              )}
            </div>

            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={7}
              aria-label="Texto del mensaje"
            />

            {redaccion?.motivo && (
              <p className="mt-2 text-xs text-slate-400">{redaccion.motivo}</p>
            )}
          </div>
        )}

        {aviso.ya_avisado && destino === 'cliente' && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            A este cliente ya se le avisó de esta cita. Volver a enviarlo descuenta otro mensaje del plan.
          </p>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={enviando || !texto.trim() || redaccion === null}>
            <MessageCircle size={16} />
            {enviando ? 'Abriendo WhatsApp…' : 'Enviar por WhatsApp'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
