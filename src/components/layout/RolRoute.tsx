import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import { rutaDeInicioSegunModulos } from '../../lib/personal'
import type { Rol } from '../../types/database'

/**
 * Restringe una ruta a ciertos roles. El Sidebar ya oculta los enlaces que el
 * usuario no puede abrir, pero la comprobación tiene que estar también aquí:
 * ocultar un enlace no impide escribir la URL a mano.
 */
export function RolRoute({ roles }: { roles: Rol[] }) {
  const { usuario, esPlataforma, tieneModulo } = useAuth()
  if (!usuario) return <Navigate to="/login" replace />
  // Cada quien vuelve a su propia casa: el de plataforma al panel, y el resto a
  // donde diga `rutaDeInicioSegunModulos` — el panel de su módulo si el negocio
  // no es clínico, y la agenda si no. Es la misma función que usan
  // `InicioSegunRol` y `ModuloRoute`, y comprueba el rol antes de mandar a un
  // panel: sin eso, un peluquero en un plan de petshop entraba en bucle.
  if (!roles.includes(usuario.rol)) {
    return (
      <Navigate to={esPlataforma ? '/plataforma' : rutaDeInicioSegunModulos(usuario, tieneModulo)} replace />
    )
  }
  return <Outlet />
}
