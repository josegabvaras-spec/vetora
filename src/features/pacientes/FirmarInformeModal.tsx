import { useState } from 'react'
import { PenLine } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FirmaDigital } from '../../components/ui/FirmaDigital'
import { firmarInforme, type InformeFirmado, type TipoInforme } from '../../services/informes'
import { useAuth } from '../../context/AuthContext'

/**
 * Recoge las dos firmas que un informe necesita antes de imprimirse.
 *
 * Van juntas en el mismo guardado porque `informes_firmados` es INSERT-only: no
 * existe un "firma el tutor ahora y el veterinario después". Firmar de nuevo
 * inserta otra fila, que pasa a ser la vigente.
 */
export function FirmarInformeModal({
  pacienteId,
  tipo,
  itemId,
  tituloDocumento,
  nombreTutor,
  etiquetaTutor = 'Propietario/a',
  etiquetaFirmante = 'Veterinario/a',
  onClose,
  onFirmado,
}: {
  /** Null solo en recibos: la venta de mostrador no tiene ficha de paciente. */
  pacienteId: string | null
  tipo: TipoInforme
  itemId: string | null
  /** Cómo se llama el documento en pantalla: «Historial clínico completo»… */
  tituloDocumento: string
  nombreTutor: string
  /** En un recibo no firma un «propietario» ni un «veterinario». */
  etiquetaTutor?: string
  etiquetaFirmante?: string
  onClose: () => void
  onFirmado: (firma: InformeFirmado) => void
}) {
  const { usuario } = useAuth()
  const [firmaTutor, setFirmaTutor] = useState<string | null>(null)
  const [firmaVeterinario, setFirmaVeterinario] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const faltanFirmas = !firmaTutor || !firmaVeterinario

  async function handleGuardar() {
    if (faltanFirmas) return
    setGuardando(true)
    setError(null)
    try {
      const firma = await firmarInforme(pacienteId, tipo, itemId, {
        firmaTutor: firmaTutor!,
        firmaVeterinario: firmaVeterinario!,
        nombreTutor,
        nombreVeterinario: usuario?.nombre ?? 'Veterinario/a',
        veterinarioId: usuario?.id ?? null,
      })
      onFirmado(firma)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo firmar el informe')
      setGuardando(false)
    }
  }

  return (
    <Modal title="Firmar para imprimir" onClose={onClose}>
      <div className="space-y-4">
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <strong>{tituloDocumento}</strong>
          <span className="mt-1 block text-xs text-slate-500">
            Las firmas quedan estampadas en el documento y guardadas junto a él.
          </span>
        </p>

        <FirmaDigital etiqueta={`${etiquetaTutor} — ${nombreTutor}`} onChange={setFirmaTutor} />
        <FirmaDigital
          etiqueta={`${etiquetaFirmante} — ${usuario?.nombre ?? ''}`}
          onChange={setFirmaVeterinario}
        />

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleGuardar} disabled={guardando || faltanFirmas}>
            <PenLine size={16} />
            {guardando ? 'Guardando…' : 'Firmar y habilitar impresión'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
