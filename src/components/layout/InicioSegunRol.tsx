import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import { rutaDeInicioSegunModulos } from '../../lib/personal'

/**
 * A dónde va cada quien al entrar o al pedir una ruta que no existe.
 *
 * El destino lo decide `rutaDeInicioSegunModulos` (lib/personal), que combina
 * el **rol** y los **módulos del plan**: un negocio no clínico entra por su
 * propio panel, y el resto por donde diga `rutaDeInicio`. Es la misma función
 * que usan `RolRoute` y `ModuloRoute` al rebotar, para que entrar y rebotar
 * lleven siempre al mismo sitio.
 *
 * `tipo_negocio` NO participa: ese campo es descriptivo y no decide nada en la
 * aplicación. Lo que segmenta el producto es el par rol + módulo del plan.
 */
export function InicioSegunRol() {
  const { usuario, tieneModulo } = useAuth()
  return <Navigate to={rutaDeInicioSegunModulos(usuario, tieneModulo)} replace />
}
