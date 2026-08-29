import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { rutaDeInicio } from '../../lib/personal'

/**
 * A dónde va cada quien al entrar o al pedir una ruta que no existe. El dueño
 * de la plataforma no tiene agenda: su casa es el panel.
 *
 * Para los negocios de tipo peluquería y petshop la pantalla de inicio sigue
 * siendo la agenda, pero el contexto (tipoNegocio) condiciona qué se muestra
 * dentro de ella (solo citas de tipo 'peluqueria', sin historial clínico).
 */
export function InicioSegunRol() {
  const { usuario } = useAuth()
  // El destino lo decide `rutaDeInicio` (lib/personal), que es la fuente única:
  // esto mismo estaba escrito aquí, en `LoginPage`, en `HomeHeader` y en el
  // canje del enlace de acceso, y esa cuarta copia se había escrito mal.
  return <Navigate to={rutaDeInicio(usuario)} replace />
}
