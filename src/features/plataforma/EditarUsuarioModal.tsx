import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Select } from '../../components/ui/Field'
import { actualizarUsuario, type DatosUsuario } from '../../services/plataforma'
import type { Rol, Sucursal, Usuario } from '../../types/database'

export function EditarUsuarioModal({
  usuario,
  sucursales,
  clinicaNombre,
  onClose,
  onGuardado,
}: {
  usuario: Usuario
  sucursales: Sucursal[]
  /** Solo se muestra fuera de `ClinicaDetalleModal`, donde la clínica no está a la vista. */
  clinicaNombre?: string
  onClose: () => void
  onGuardado: () => void
}) {
  const [nombre, setNombre] = useState(usuario.nombre)
  const [email, setEmail] = useState(usuario.email)
  const [whatsapp, setWhatsapp] = useState(usuario.whatsapp)
  const [rol, setRol] = useState<Rol>(usuario.rol)
  const [sucursalId, setSucursalId] = useState(usuario.sucursal_id ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    const datos: DatosUsuario = {
      nombre,
      email,
      whatsapp,
      rol,
      sucursal_id: sucursalId || null,
    }
    try {
      await actualizarUsuario(usuario.id, datos)
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el usuario')
      setGuardando(false)
    }
  }

  return (
    <Modal title="Editar usuario" onClose={onClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        {clinicaNombre && (
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{clinicaNombre}</p>
        )}
        <FieldGroup label="Nombre">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" required />
        </FieldGroup>
        <FieldGroup label="Correo">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="persona@clinica.bo"
            required
          />
        </FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldGroup label="WhatsApp">
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+591 7…" required />
          </FieldGroup>
          <FieldGroup label="Rol">
            <Select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              <option value="admin">Administrador</option>
              <option value="veterinario">Veterinario</option>
              <option value="recepcion">Recepción</option>
              <option value="peluquero">Peluquero</option>
            </Select>
          </FieldGroup>
        </div>
        <FieldGroup label="Sucursal">
          <Select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
            <option value="">Todas</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Select>
        </FieldGroup>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
