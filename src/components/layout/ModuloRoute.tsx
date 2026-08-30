import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import { rutaDeInicioSegunModulos } from '../../lib/personal'
import type { ModuloVetora } from '../../types/database'

/**
 * Restringe una ruta a los módulos que contrató la clínica (migración 0024).
 *
 * Hermano de [RolRoute](./RolRoute.tsx), y por el mismo motivo: el `Sidebar` ya
 * oculta el enlace de un módulo que el plan no incluye, pero **ocultar un enlace
 * no impide escribir la URL a mano**. Las dos cosas, siempre.
 *
 * ⚠️ **Esto es una puerta COMERCIAL, no de seguridad.** A diferencia del
 * aislamiento entre clínicas —que lo garantiza la RLS de PostgreSQL—, aquí no
 * hay nada en la base que impida a una clínica sin el módulo `historial_clinico`
 * consultar `historial_clinico` por PostgREST con su propio token: sus policies
 * solo miran `clinica_id` y el rol, no el plan. Lo que se está protegiendo es el
 * empaquetado del producto, no datos ajenos. Si algún día un módulo pasa a
 * proteger algo sensible, tendrá que bajar a la RLS.
 */
export function ModuloRoute({ modulo }: { modulo: ModuloVetora }) {
  const { usuario, tieneModulo } = useAuth()

  if (!usuario) return <Navigate to="/login" replace />

  // Se rebota a la casa del negocio, no siempre a la agenda: un petshop
  // aterrizaba en una agenda clínica que ni siquiera tiene en su menú.
  // `rutaDeInicioSegunModulos` es la misma que usa `InicioSegunRol`, así que
  // entrar y rebotar llevan al mismo sitio, y comprueba el ROL antes de mandar
  // a un panel de módulo — sin eso el rebote podía entrar en bucle.
  //
  // ⚠️ **La RUTA `/agenda` nunca debe envolverse en un `ModuloRoute`**: es el
  // terminal al que se cae cuando nada más encaja, y gatearla crearía un bucle
  // de redirecciones que cuelga la aplicación. Su ENTRADA DEL MENÚ sí está
  // gateada (`modulo: 'agenda'` en `enlacesClinicos`), que es otra cosa: oculta
  // el enlace sin cerrar la puerta.
  if (!tieneModulo(modulo)) {
    return <Navigate to={rutaDeInicioSegunModulos(usuario, tieneModulo)} replace />
  }

  return <Outlet />
}
