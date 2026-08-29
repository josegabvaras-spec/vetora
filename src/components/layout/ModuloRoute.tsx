import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
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

  // Se rebota a la agenda, que es la casa de todo el personal.
  //
  // ⚠️ Por eso **`/agenda` nunca debe envolverse en un `ModuloRoute`**: si se
  // gateara y un plan no lo trajera, `InicioSegunRol` mandaría a `/agenda`, el
  // guardián devolvería a la raíz, y de ahí otra vez a `/agenda` — un bucle de
  // redirecciones que deja la aplicación colgada. La agenda está además en el
  // DEFAULT de `modulos_habilitados` (0024), así que todo plan la tiene.
  if (!tieneModulo(modulo)) return <Navigate to="/agenda" replace />

  return <Outlet />
}
