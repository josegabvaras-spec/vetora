import { useState } from 'react'
import { MessageCircle, RefreshCw, Sparkles } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { FieldGroup, Input, Textarea } from '../../components/ui/Field'
import { redactarMensajeLibre, type Redaccion } from '../../services/asistente'
import { enviarMensajeWhatsapp } from '../../services/whatsapp'
import { useAuth } from '../../context/useAuth'

/**
 * Un mensaje suelto para alguien que no tiene un aviso pendiente que lo
 * dispare — "recuérdale a Juan que traiga la muestra mañana". Es la vía
 * barata para eso: Haiku, no el copiloto, y gasta el cupo de redacción (20×
 * más grande) en vez del de consultas. Preguntarle lo mismo al copiloto en
 * "Pregúntale a Vetora" también funciona, pero cuesta ~19 veces más y gasta
 * el cupo equivocado — este modal es la vía pensada para esto.
 */
export function RedactarMensajeModal({ onClose }: { onClose: () => void }) {
  const { usuario } = useAuth()
  const [pedido, setPedido] = useState('')
  const [dueno, setDueno] = useState('')
  const [whatsapp, setWhatsapp] = useState('')

  const [redaccion, setRedaccion] = useState<Redaccion | null>(null)
  const [texto, setTexto] = useState('')
  const [redactando, setRedactando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function redactar() {
    if (pedido.trim().length < 3) return
    setRedactando(true)
    setError(null)
    try {
      const resultado = await redactarMensajeLibre(pedido, { dueno: dueno.trim() || undefined })
      setRedaccion(resultado)
      setTexto(resultado.texto)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo redactar el mensaje')
    } finally {
      setRedactando(false)
    }
  }

  async function enviar() {
    if (!usuario?.clinica_id || enviando) return
    setEnviando(true)
    setError(null)

    // Mismo patrón que MensajeModal: la pestaña se abre dentro del gesto del
    // clic, antes del `await` — si se abriera después, `enviarMensajeWhatsapp`
    // ya habría gastado la cuota de WhatsApp y el navegador bloquearía el
    // popup por no venir de una acción directa del usuario.
    const ventana = window.open('', '_blank')
    if (ventana) ventana.opener = null

    try {
      const enlace = await enviarMensajeWhatsapp(usuario.clinica_id, whatsapp, texto)
      if (ventana) ventana.location.href = enlace
      else window.location.href = enlace
      onClose()
    } catch (err) {
      ventana?.close()
      setError(err instanceof Error ? err.message : 'No se pudo enviar el mensaje')
      setEnviando(false)
    }
  }

  return (
    <Modal title="Redactar mensaje" onClose={onClose} widthClassName="max-w-xl">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldGroup label="Destinatario (opcional)">
            <Input
              value={dueno}
              onChange={(e) => setDueno(e.target.value)}
              placeholder="Para personalizar el saludo"
            />
          </FieldGroup>
          <FieldGroup label="WhatsApp">
            <Input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+591 7xxxxxxx"
            />
          </FieldGroup>
        </div>

        <FieldGroup label="¿Qué quieres decirle?">
          <Textarea
            value={pedido}
            onChange={(e) => setPedido(e.target.value)}
            rows={3}
            placeholder="Ej. Recuérdale que mañana debe traer la muestra de orina en ayunas."
          />
        </FieldGroup>

        {redaccion === null ? (
          <Button onClick={redactar} disabled={redactando || pedido.trim().length < 3}>
            <Sparkles size={16} />
            {redactando ? 'Redactando…' : 'Redactar mensaje'}
          </Button>
        ) : (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Mensaje
              </span>
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
                  disabled={redactando}
                  className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-slate-500 hover:text-teal-700"
                >
                  <RefreshCw size={12} /> Rehacer
                </button>
              </div>
            </div>

            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={6}
              aria-label="Texto del mensaje"
            />

            {redaccion.motivo && <p className="mt-2 text-xs text-slate-400">{redaccion.motivo}</p>}
          </div>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={enviar}
            disabled={enviando || redaccion === null || !texto.trim() || !whatsapp.replace(/\D/g, '')}
          >
            <MessageCircle size={16} />
            {enviando ? 'Abriendo WhatsApp…' : 'Enviar por WhatsApp'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
