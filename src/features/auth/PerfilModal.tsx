import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input } from '../../components/ui/Field'
import { Seccion } from '../../components/ui/Seccion'
import { useAuth } from '../../context/AuthContext'
import { cambiarMiPassword } from '../../services/cuentas'
import { Badge } from '../../components/ui/Badge'
import { useTable } from '../../mocks/useDb'

const ROL_LABEL: Record<string, string> = {
  admin: 'Administrador',
  veterinario: 'Veterinario',
  recepcion: 'Recepción',
}

export function PerfilModal({ onClose }: { onClose: () => void }) {
  const { usuario } = useAuth()
  const sucursales = useTable('sucursales')
  
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState(false)
  const [guardando, setGuardando] = useState(false)

  if (!usuario) return null

  const sucursalNombre = usuario.sucursal_id 
    ? sucursales.find(s => s.id === usuario.sucursal_id)?.nombre 
    : 'Todas las sucursales'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setExito(false)
    
    if (nueva !== confirmacion) {
      setError('Las nuevas contraseñas no coinciden')
      return
    }
    if (nueva.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres')
      return
    }

    setGuardando(true)
    try {
      await cambiarMiPassword(usuario!.id, actual, nueva)
      setExito(true)
      setActual('')
      setNueva('')
      setConfirmacion('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar la contraseña')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal title="Mi Perfil" onClose={onClose} widthClassName="max-w-md">
      <div className="space-y-6">
        
        {/* Información del Usuario */}
        <Seccion titulo="Mis Datos">
          <div className="flex flex-col gap-1 rounded-lg border border-slate-100 bg-slate-50 p-4">
            <p className="text-sm font-bold text-slate-900">{usuario.nombre}</p>
            <p className="text-sm text-slate-500">{usuario.email}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone="teal">{ROL_LABEL[usuario.rol]}</Badge>
              <Badge tone="slate">{sucursalNombre}</Badge>
            </div>
          </div>
        </Seccion>

        {/* Cambio de Contraseña */}
        <Seccion titulo="Cambiar Contraseña">
          <form onSubmit={handleSubmit} className="space-y-4">
            <FieldGroup label="Contraseña actual">
              <Input 
                type="password" 
                value={actual} 
                onChange={e => setActual(e.target.value)} 
                required 
              />
            </FieldGroup>
            <FieldGroup label="Nueva contraseña">
              <Input 
                type="password" 
                value={nueva} 
                onChange={e => setNueva(e.target.value)} 
                required 
                minLength={8}
              />
            </FieldGroup>
            <FieldGroup label="Confirmar nueva contraseña">
              <Input 
                type="password" 
                value={confirmacion} 
                onChange={e => setConfirmacion(e.target.value)} 
                required 
                minLength={8}
              />
            </FieldGroup>

            {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
            {exito && <p className="text-sm font-bold text-emerald-600">¡Contraseña actualizada con éxito!</p>}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={onClose} className="mr-2">
                Cerrar
              </Button>
              <Button type="submit" disabled={guardando}>
                {guardando ? 'Guardando...' : 'Actualizar contraseña'}
              </Button>
            </div>
          </form>
        </Seccion>
      </div>
    </Modal>
  )
}
