import { Outlet } from 'react-router-dom'
import { PeluqueriaNav } from '../../features/peluqueria/PeluqueriaNav'
import { useAuth } from '../../context/useAuth'
import { panelDelNegocio } from '../../lib/personal'

/**
 * La barra de secciones solo se pinta cuando el negocio **no es** una
 * peluquería: en una veterinaria que además pela, donde estas pantallas no
 * están en el menú lateral y esta barra es la única forma de recorrerlas.
 *
 * Cuando el negocio ES una peluquería, sus doce secciones **son** el menú
 * lateral (`menuDelNegocio`), y pintarlas otra vez aquí sería el mismo menú dos
 * veces en la misma pantalla.
 */
export function PeluqueriaLayout() {
  const { modulosHabilitados } = useAuth()
  const enElMenuPrincipal = panelDelNegocio(modulosHabilitados) === 'peluqueria'

  return (
    <div className="flex flex-col min-h-full">
      {!enElMenuPrincipal && <PeluqueriaNav />}
      <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
        <Outlet />
      </div>
    </div>
  )
}
