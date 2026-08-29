import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import { rutaDeInicio } from '../../lib/personal'

/**
 * A dónde va cada quien al entrar o al pedir una ruta que no existe.
 *
 * Dos criterios, en este orden:
 *
 * 1. **El rol**, que resuelve `rutaDeInicio` (lib/personal) y es la fuente
 *    única —la comparten `LoginPage`, `AccesoPage` y el botón de sesión de
 *    `HomeHeader`, que no tienen los módulos a mano—. El dueño de la
 *    plataforma no tiene agenda: su casa es el panel.
 *
 * 2. **El módulo contratado**, que solo se puede mirar aquí porque hace falta
 *    `useAuth()`. Una peluquería o un petshop tienen su propio panel, y
 *    aterrizar en la agenda clínica —con sus citas de cirugía y vacunas— era
 *    justo la queja: «el dashboard es el mismo que el de una clínica».
 *
 * `tipo_negocio` NO participa, y no es un olvido: ese campo es descriptivo y no
 * decide nada en la aplicación. Lo que segmenta el producto de verdad es el par
 * rol + módulo del plan. (Aquí había un comentario que afirmaba que
 * `tipoNegocio` filtraba las citas de la agenda; era falso y confundía.)
 */
export function InicioSegunRol() {
  const { usuario, tieneModulo } = useAuth()

  // Solo para el negocio NO clínico. Una veterinaria que además hace
  // peluquería (plan mixto, con `historial_clinico`) sigue entrando por la
  // agenda: ahí la peluquería es una sección más, no el negocio.
  if (usuario && usuario.rol !== 'cliente' && !tieneModulo('historial_clinico')) {
    if (tieneModulo('peluqueria')) return <Navigate to="/peluqueria/dashboard" replace />
    if (tieneModulo('petshop')) return <Navigate to="/petshop/dashboard" replace />
  }

  return <Navigate to={rutaDeInicio(usuario)} replace />
}
