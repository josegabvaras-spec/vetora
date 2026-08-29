import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import type { Rol } from '../../types/database'

/**
 * Restringe una ruta a ciertos roles. El Sidebar ya oculta los enlaces que el
 * usuario no puede abrir, pero la comprobación tiene que estar también aquí:
 * ocultar un enlace no impide escribir la URL a mano.
 */
export function RolRoute({ roles }: { roles: Rol[] }) {
  const { usuario, esPlataforma } = useAuth()
  if (!usuario) return <Navigate to="/login" replace />
  // Cada rol vuelve a su propia casa: el de plataforma al panel, el resto a la agenda.
  if (!roles.includes(usuario.rol)) {
    return <Navigate to={esPlataforma ? '/plataforma' : '/agenda'} replace />
  }
  return <Outlet />
}
