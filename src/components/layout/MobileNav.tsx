import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import { Menu } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { enlacesVisibles } from './Sidebar'

/** Cuántos accesos directos caben sin apretar junto al botón de menú. */
const MAX_PESTANAS = 3

export function MobileNav({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  const { usuario } = useAuth()
  const enlaces = enlacesVisibles(usuario?.rol)
  // Priorizar Caja, Agenda y Pacientes
  const prioritarios = ['/caja', '/agenda', '/pacientes']
  const navItems = enlaces.filter(e => prioritarios.includes(e.to))
  
  // Si por rol no tiene acceso a Caja, rellenar hasta MAX_PESTANAS con otras opciones
  if (navItems.length < MAX_PESTANAS) {
    const extras = enlaces.filter(e => !prioritarios.includes(e.to)).slice(0, MAX_PESTANAS - navItems.length)
    navItems.push(...extras)
  }

  return (
    // Por debajo del velo del menú lateral (`z-40`): con la misma capa, y al ir
    // después en el árbol, la barra quedaría iluminada sobre el fondo oscuro.
    <nav
      aria-label="Accesos directos"
      className="fixed bottom-0 left-0 z-30 w-full border-t border-slate-200/60 bg-white/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(0,0,0,0.04)] backdrop-blur-xl md:hidden"
    >
      <div className="flex h-16 items-center justify-around px-2">
        {navItems.map(({ to, etiquetaCorta, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1 transition-colors duration-200',
                isActive
                  ? 'text-teal-600'
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600',
              )
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={clsx(
                    'flex h-8 w-12 items-center justify-center rounded-full transition-all duration-300',
                    isActive ? 'bg-teal-50 text-teal-600' : 'bg-transparent'
                  )}
                >
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className={clsx(isActive && 'scale-110 transition-transform')} />
                </div>
                <span
                  className={clsx(
                    'w-full truncate text-center text-[10px] font-semibold tracking-wide',
                    isActive ? 'text-teal-700' : 'text-slate-500',
                  )}
                >
                  {etiquetaCorta ?? label}
                </span>
              </>
            )}
          </NavLink>
        ))}

        <button
          onClick={onAbrirMenu}
          className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1 text-slate-400 transition-colors duration-200 hover:bg-slate-50 hover:text-slate-600"
        >
          <div className="flex h-8 w-12 items-center justify-center rounded-full bg-transparent transition-all duration-300">
            <Menu size={20} strokeWidth={2} />
          </div>
          <span className="text-[10px] font-semibold tracking-wide text-slate-500">
            Menú
          </span>
        </button>
      </div>
    </nav>
  )
}
