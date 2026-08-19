import { useState } from 'react'
import { Activity } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Textarea } from '../../components/ui/Field'
import { useAuth } from '../../context/AuthContext'
import { registrarNotaInternacion } from '../../services/internacion'
import { aNumeroOpcional } from '../../lib/numeros'

export function RegistrarEvolucionModal({
  internacionId,
  pacienteNombre,
  onClose,
  onGuardado,
}: {
  internacionId: string
  pacienteNombre: string
  onClose: () => void
  onGuardado: () => void
}) {
  const { usuario } = useAuth()
  const [nota, setNota] = useState('')
  const [temperatura, setTemperatura] = useState('')
  const [frecCardiaca, setFrecCardiaca] = useState('')
  const [frecRespiratoria, setFrecRespiratoria] = useState('')
  const [peso, setPeso] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tieneDatos = Boolean(
    nota.trim() || temperatura.trim() || frecCardiaca.trim() || frecRespiratoria.trim() || peso.trim(),
  )

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      const vetId = usuario?.id || ''
      await registrarNotaInternacion(internacionId, vetId, {
        nota,
        temperatura_c: aNumeroOpcional(temperatura),
        frecuencia_cardiaca: aNumeroOpcional(frecCardiaca),
        frecuencia_respiratoria: aNumeroOpcional(frecRespiratoria),
        peso_kg: aNumeroOpcional(peso),
      })
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la evolución')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      title={`Registrar Evolución — ${pacienteNombre}`}
      onClose={onClose}
      widthClassName="max-w-lg"
    >
      <div className="space-y-4">
        <FieldGroup label="Evolución clínica / Estado del paciente">
          <Textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Describa el estado actual, comportamiento, apetito, respuesta a tratamiento o novedades…"
            rows={4}
          />
        </FieldGroup>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            Constantes vitales (opcional)
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FieldGroup label="Temp. (°C)">
              <Input
                type="number"
                step="0.01"
                placeholder="38.5"
                value={temperatura}
                onChange={(e) => setTemperatura(e.target.value)}
              />
            </FieldGroup>
            <FieldGroup label="Frec. Card.">
              <Input
                type="number"
                step="0.01"
                placeholder="110"
                value={frecCardiaca}
                onChange={(e) => setFrecCardiaca(e.target.value)}
              />
            </FieldGroup>
            <FieldGroup label="Frec. Resp.">
              <Input
                type="number"
                step="0.01"
                placeholder="24"
                value={frecRespiratoria}
                onChange={(e) => setFrecRespiratoria(e.target.value)}
              />
            </FieldGroup>
            <FieldGroup label="Peso (kg)">
              <Input
                type="number"
                step="0.01"
                placeholder="5.2"
                value={peso}
                onChange={(e) => setPeso(e.target.value)}
              />
            </FieldGroup>
          </div>
        </div>

        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}

        <p className="text-xs text-slate-400">
          Nota: La evolución registrada quedará firmada y formará parte del expediente médico del paciente.
        </p>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={!tieneDatos || guardando}>
            <Activity size={16} />
            {guardando ? 'Guardando…' : 'Guardar evolución'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
