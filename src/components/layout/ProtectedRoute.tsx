import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTable } from '../../mocks/useDb'
import { motivoDeBloqueo } from '../../services/sesion'

export function ProtectedRoute() {
  const { usuario, logout } = useAuth()
  // Suscribirse a `clinicas` hace que suspender una cuenta expulse la sesión ya
  // abierta, no solo impida el próximo login.
  useTable('clinicas')

  if (!usuario) return <Navigate to="/login" replace />

  const bloqueo = motivoDeBloqueo(usuario)
  if (bloqueo) {
    logout()
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
