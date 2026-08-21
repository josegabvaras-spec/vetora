import { useEffect, useRef, useState } from 'react'
import { Check, Copy, MessageCircle } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import {
  crearInvitacion,
  enlaceDeAcceso,
  marcarInvitacionEnviada,
  mensajeDeAcceso,
} from '../../services/invitaciones'
import { enlaceWhatsapp } from '../../lib/whatsapp'
import type { Usuario } from '../../types/database'

/**
 * Enlace de acceso de un usuario, listo para mandárselo por WhatsApp. El envío
 * abre WhatsApp con el mensaje escrito: no consume la cuota mensual de la
 * clínica, porque es un mensaje de la plataforma para dar de alta a alguien.
 */
export function EnviarAccesoModal({
  usuario,
  clinicaNombre,
  onClose,
}: {
  usuario: Usuario
  clinicaNombre: string
  onClose: () => void
}) {
  const [enlace, setEnlace] = useState<string | null>(null)
  const [invitacionId, setInvitacionId] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const temporizadorCopiado = useRef<number | null>(null)

  useEffect(() => () => {
    if (temporizadorCopiado.current !== null) window.clearTimeout(temporizadorCopiado.current)
  }, [])

  useEffect(() => {
    crearInvitacion(usuario.id)
      .then((invitacion) => {
        setInvitacionId(invitacion.id)
        setEnlace(enlaceDeAcceso(invitacion.token))
        setEnviado(!!invitacion.enviado_at)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo generar el acceso'))
  }, [usuario.id])

  const mensaje = enlace ? mensajeDeAcceso(usuario, clinicaNombre, enlace) : ''

  async function abrirWhatsapp() {
    if (!enlace || !invitacionId) return
    // La ventana se abre primero, dentro del gesto del clic (este orden ya era
    // el correcto). Lo que faltaba era capturar el fallo del marcado: si no, la
    // promesa quedaba rechazada sin manejar y el enlace figuraba como no
    // enviado sin que nadie lo supiera.
    window.open(enlaceWhatsapp(usuario.whatsapp, mensaje), '_blank', 'noopener,noreferrer')
    try {
      await marcarInvitacionEnviada(invitacionId)
      setEnviado(true)
    } catch (err) {
      setError(
        err instanceof Error
          ? `El mensaje se abrió, pero no se pudo marcar como enviado: ${err.message}`
          : 'El mensaje se abrió, pero no se pudo marcar como enviado.',
      )
    }
  }

  async function copiar() {
    if (!enlace) return
    try {
      await navigator.clipboard.writeText(enlace)
      setCopiado(true)
      // Se guarda para poder cancelarlo al desmontar: cerrar el modal antes de
      // los 2 s dejaba un `setState` sobre un componente que ya no existe.
      temporizadorCopiado.current = window.setTimeout(() => setCopiado(false), 2000)
    } catch {
      setError('No se pudo copiar. Selecciona el enlace y cópialo a mano.')
    }
  }

  return (
    <Modal title={`Enviar acceso a ${usuario.nombre}`} onClose={onClose}>
      <div className="space-y-4">
        {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

        {enlace && (
          <>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Se enviará a</p>
              <p className="text-sm font-bold text-slate-900">{usuario.whatsapp}</p>
            </div>

            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Enlace de acceso</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
                  {enlace}
                </code>
                <Button variant="secondary" onClick={copiar} className="shrink-0 px-3 py-2 text-xs">
                  {copiado ? <Check size={14} /> : <Copy size={14} />}
                  {copiado ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
            </div>

            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Mensaje</p>
              <p className="whitespace-pre-line rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-600">
                {mensaje}
              </p>
            </div>

            <p className="text-xs text-slate-500">
              El enlace sirve una sola vez y caduca en 7 días. Si la persona lo pierde, genera otro desde aquí.
            </p>

            {enviado && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                Acceso enviado. Si WhatsApp no se abrió, copia el enlace y mándalo por donde prefieras.
              </p>
            )}
          </>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={abrirWhatsapp} disabled={!enlace}>
            <MessageCircle size={16} /> {enviado ? 'Volver a enviar' : 'Enviar por WhatsApp'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
