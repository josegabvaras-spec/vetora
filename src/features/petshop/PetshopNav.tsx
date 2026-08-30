import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import { useAuth } from '../../context/useAuth'
import { ENLACES_PETSHOP } from '../../components/layout/enlacesPetshop'

/**
 * La barra horizontal del panel del Pet Shop. Gemela de
 * [PeluqueriaNav](../peluqueria/PeluqueriaNav.tsx) y con la misma condición:
 * **solo se pinta cuando el negocio NO es un petshop**, o sea en una
 * veterinaria que además vende, donde estas secciones no están en el menú
 * lateral. Lo decide `PetshopLayout` con `panelDelNegocio`.
 *
 * La lista vive en `components/layout/enlacesPetshop.ts`, compartida con el
 * menú principal — un fichero que exporta componentes Y constantes rompe el
 * Fast Refresh de Vite.
 */
export function PetshopNav() {
  const { usuario } = useAuth()
  const rol = usuario?.rol

  const visibles = ENLACES_PETSHOP.filter(
    (s) => !s.roles || (rol !== undefined && s.roles.includes(rol)),
  )

  return (
    <div className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-20 px-4">
      <div className="flex items-center space-x-1 overflow-x-auto py-2 no-scrollbar">
        {visibles.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap',
                isActive
                  ? 'bg-teal-50 text-teal-800 border border-teal-200/60 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent',
              )
            }
          >
            <Icon size={15} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  )
}
