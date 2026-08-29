import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Textarea } from '../../components/ui/Field'
import { crearProveedor, actualizarProveedor } from '../../services/compras'
import type { Proveedor } from '../../types/database'

interface NuevoProveedorModalProps {
  proveedorAEditar?: Proveedor | null
  onClose: () => void
  onSaved: () => void
}

export function NuevoProveedorModal({
  proveedorAEditar,
  onClose,
  onSaved,
}: NuevoProveedorModalProps) {
  const [empresa, setEmpresa] = useState(proveedorAEditar?.empresa || '')
  const [nit, setNit] = useState(proveedorAEditar?.nit || '')
  const [contacto, setContacto] = useState(proveedorAEditar?.contacto || '')
  const [telefono, setTelefono] = useState(proveedorAEditar?.telefono || '')
  const [whatsapp, setWhatsapp] = useState(proveedorAEditar?.whatsapp || '')
  const [email, setEmail] = useState(proveedorAEditar?.email || '')
  const [direccion, setDireccion] = useState(proveedorAEditar?.direccion || '')
  const [notas, setNotas] = useState(proveedorAEditar?.notas || '')

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!empresa.trim()) {
      setError('El nombre de la empresa es obligatorio')
      return
    }

    setGuardando(true)
    setError(null)

    try {
      if (proveedorAEditar) {
        await actualizarProveedor(proveedorAEditar.id, {
          empresa,
          nit,
          contacto,
          telefono,
          whatsapp,
          email,
          direccion,
          notas,
        })
      } else {
        await crearProveedor({
          empresa,
          nit,
          contacto,
          telefono,
          whatsapp,
          email,
          direccion,
          notas,
        })
      }

      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error al guardar proveedor')
      setGuardando(false)
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={proveedorAEditar ? 'Editar Proveedor' : 'Nuevo Proveedor'}
      widthClassName="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldGroup label="Empresa / Distribuidora">
            <Input
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              placeholder="Ej. Distribuidora PetBolivia S.R.L."
              required
            />
          </FieldGroup>

          <FieldGroup label="NIT / RUC">
            <Input
              value={nit}
              onChange={(e) => setNit(e.target.value)}
              placeholder="Ej. 1028374029"
            />
          </FieldGroup>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldGroup label="Persona de Contacto">
            <Input
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
              placeholder="Ej. Juan Pérez (Ventas)"
            />
          </FieldGroup>

          <FieldGroup label="WhatsApp">
            <Input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="Ej. 59170012345"
            />
          </FieldGroup>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldGroup label="Teléfono Fijo / Celular">
            <Input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Ej. 3-3456789"
            />
          </FieldGroup>

          <FieldGroup label="Correo Electrónico">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ventas@petbolivia.com"
            />
          </FieldGroup>
        </div>

        <FieldGroup label="Dirección / Ciudad">
          <Input
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            placeholder="Ej. Av. Cristo Redentor #450, Santa Cruz"
          />
        </FieldGroup>

        <FieldGroup label="Notas / Condiciones Comerciales">
          <Textarea
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Días de entrega, crédito a 30 días, etc."
          />
        </FieldGroup>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={guardando}>
            {guardando ? 'Guardando...' : proveedorAEditar ? 'Guardar Cambios' : 'Registrar Proveedor'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
