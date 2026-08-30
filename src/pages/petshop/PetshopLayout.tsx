import { Outlet } from 'react-router-dom'
import { PetshopNav } from '../../features/petshop/PetshopNav'
import { useAuth } from '../../context/useAuth'
import { panelDelNegocio } from '../../lib/personal'

/**
 * Gemelo de [PeluqueriaLayout](../peluqueria/PeluqueriaLayout.tsx): la barra
 * solo se pinta en una veterinaria que además vende. Cuando el negocio ES un
 * petshop, sus secciones ya son el menú lateral.
 */
export function PetshopLayout() {
  const { modulosHabilitados } = useAuth()
  const enElMenuPrincipal = panelDelNegocio(modulosHabilitados) === 'petshop'

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50">
      {!enElMenuPrincipal && <PetshopNav />}
      <div className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
        <Outlet />
      </div>
    </div>
  )
}
