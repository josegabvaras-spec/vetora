import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FirmaDigital } from '../../components/ui/FirmaDigital'
import { generarConsentimiento } from '../../services/consentimientos'
import { formatClinicDateTime } from '../../lib/datetime'
import type { CitaConDetalle } from '../../types/views'

/**
 * Recoge en pantalla las dos firmas del consentimiento y lo guarda.
 *
 * Las dos van en el mismo guardado porque la tabla es INSERT-only: no existe un
 * "guardar ahora y que el veterinario firme luego". Por eso el botón no se
 * habilita hasta que ambas están, y por eso el texto legal se enseña **encima**
 * de los recuadros: se firma lo que se acaba de leer.
 */
export function FirmarConsentimientoModal({
  cita,
  onClose,
  onFirmado,
}: {
  cita: CitaConDetalle
  onClose: () => void
  onFirmado: () => void
}) {
  const [firmaTutor, setFirmaTutor] = useState<string | null>(null)
  const [firmaVeterinario, setFirmaVeterinario] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const procedimiento = cita.servicio_nombre || 'Procedimiento quirúrgico'
  const faltanFirmas = !firmaTutor || !firmaVeterinario

  async function handleGuardar() {
    if (faltanFirmas) return
    setGuardando(true)
    setError(null)
    try {
      await generarConsentimiento(cita.id, cita.paciente_id, 'firma_digital', {
        firmaTutor: firmaTutor!,
        firmaVeterinario: firmaVeterinario!,
        nombreTutor: cita.paciente.cliente.nombre,
        nombreVeterinario: cita.veterinario_nombre,
        veterinarioId: cita.veterinario_id,
      })
      onFirmado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el consentimiento')
      setGuardando(false)
    }
  }

  return (
    <Modal title="Firmar consentimiento de cirugía" onClose={onClose}>
      <div className="space-y-4">
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="font-semibold text-slate-800">{procedimiento}</p>
          <p className="text-slate-600">
            {cita.paciente.nombre} · {cita.paciente.cliente.nombre}
          </p>
          <p className="text-xs text-slate-500">{formatClinicDateTime(cita.fecha_hora)}</p>
        </section>

        <p className="max-h-32 overflow-y-auto rounded-lg border border-slate-200 p-3 text-xs leading-relaxed text-slate-600">
          Declaro haber sido informado/a de manera clara sobre la naturaleza del procedimiento{' '}
          <strong>{procedimiento}</strong>, sus riesgos inherentes (incluyendo reacciones anestésicas, hemorragias o
          complicaciones postoperatorias), los beneficios esperados y las alternativas disponibles. Habiendo resuelto
          mis dudas, otorgo mi consentimiento informado y voluntario para que el equipo veterinario lo realice,
          incluyendo los actos anestésicos y complementarios que resulten necesarios.
        </p>

        <FirmaDigital etiqueta={`Tutor/a — ${cita.paciente.cliente.nombre}`} onChange={setFirmaTutor} />
        <FirmaDigital etiqueta={`Veterinario/a — ${cita.veterinario_nombre}`} onChange={setFirmaVeterinario} />

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <p className="text-xs text-slate-500">
          Una vez guardado, el consentimiento es inmutable y queda en el historial del paciente y en el panel del
          dueño/a.
        </p>

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleGuardar} disabled={guardando || faltanFirmas}>
            <ShieldCheck size={16} />
            {guardando ? 'Guardando…' : 'Guardar consentimiento'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
