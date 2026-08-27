import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input } from '../../components/ui/Field'
import { vincularCuentaPortal } from '../../services/clientesPacientes'

export function VincularCuentaPortalModal({
  clienteId,
  clinicaId,
  onClose,
  onVinculado,
}: {
  clienteId: string
  clinicaId: string
  onClose: () => void
  onVinculado: () => void
}) {
  const [email, setEmail] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    try {
      await vincularCuentaPortal(clienteId, clinicaId, email)
      onVinculado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo vincular la cuenta')
      setGuardando(false)
    }
  }

  return (
    <Modal title="Vincular cuenta del portal" onClose={onClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <p className="text-sm text-slate-600">
          Para dueños que ya se registraron en el portal pero con un CI o WhatsApp que no coincidió
          con esta ficha, y quedaron como una cuenta separada. Escribe el correo con el que se
          registraron: si tiene una ficha propia vacía (sin mascotas), se une a esta.
        </p>
        <FieldGroup label="Correo de la cuenta del portal">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="dueño@correo.com"
            required
          />
        </FieldGroup>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={guardando}>
            {guardando ? 'Vinculando…' : 'Vincular'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
