import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import { useAuth } from '../../context/useAuth'
import { ENLACES_PELUQUERIA } from '../../components/layout/enlacesPeluqueria'

/**
 * La barra horizontal del panel de peluquería.
 *
 * **Solo se pinta cuando el negocio NO es una peluquería** — es decir, en una
 * veterinaria que además pela, donde estas secciones no están en el menú
 * lateral y esta barra es la única forma de recorrerlas. Lo decide
 * `PeluqueriaLayout` con `panelDelNegocio`; en una peluquería pura sería el
 * mismo menú dos veces en la misma pantalla.
 *
 * La lista vive en `components/layout/enlacesPeluqueria.ts`: la comparten esta
 * barra y el menú principal, y tenerla aquí rompía el Fast Refresh de Vite (un
 * fichero que exporta componentes Y constantes recarga el módulo entero).
 */
export function PeluqueriaNav() {
  const { usuario } = useAuth()
  const rol = usuario?.rol

  const visibles = ENLACES_PELUQUERIA.filter(
    (s) => !s.roles || (rol !== undefined && s.roles.includes(rol)),
  )

  return (
    <div className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-20">
      <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-2 sm:px-6 no-scrollbar">
        {visibles.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all min-h-10 cursor-pointer',
                isActive
                  ? 'bg-teal-500 text-white shadow-sm shadow-teal-500/20'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )
            }
          >
            <Icon size={16} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  )
}
