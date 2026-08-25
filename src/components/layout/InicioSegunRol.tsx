import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

/**
 * A dónde va cada quien al entrar o al pedir una ruta que no existe. El dueño
 * de la plataforma no tiene agenda: su casa es el panel.
 *
 * Para los negocios de tipo peluquería y petshop la pantalla de inicio sigue
 * siendo la agenda, pero el contexto (tipoNegocio) condiciona qué se muestra
 * dentro de ella (solo citas de tipo 'peluqueria', sin historial clínico).
 */
export function InicioSegunRol() {
  const { usuario, esPlataforma } = useAuth()
  if (!usuario) return <Navigate to="/login" replace />
  if (esPlataforma) return <Navigate to="/plataforma" replace />
  if (usuario.rol === 'cliente') return <Navigate to={`/portal-cliente/dashboard`} replace />
  return <Navigate to="/agenda" replace />
}
