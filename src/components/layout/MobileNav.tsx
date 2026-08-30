import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import { Menu } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { menuDelNegocio } from './enlacesClinicos'

/** Cuántos accesos directos caben sin apretar junto al botón de menú. */
const MAX_PESTANAS = 3

export function MobileNav({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  const { usuario, modulosHabilitados } = useAuth()
  const enlaces = menuDelNegocio(usuario?.rol, modulosHabilitados)
  // Caja, Agenda y Asistente.
  //
  // El Asistente entró en lugar de Pacientes porque es la pantalla desde la que
  // se navega: enseña las consultas por atender, las citas de hoy y lo que toca
  // avisar, y desde ahí se llega al paciente concreto en un toque. Buscar al
  // paciente por su nombre es el camino largo, y sigue estando en el menú.
  const prioritarios = ['/caja', '/agenda', '/asistente']
  const navItems = enlaces.filter(e => prioritarios.includes(e.to))

  // Si por rol falta alguna (el veterinario no ve Caja), se rellena hasta
  // MAX_PESTANAS con lo siguiente del menú — que para él es justamente
  // Pacientes, así que no lo pierde: solo deja de ocupar el sitio del Asistente.
  if (navItems.length < MAX_PESTANAS) {
    const extras = enlaces.filter(e => !prioritarios.includes(e.to)).slice(0, MAX_PESTANAS - navItems.length)
    navItems.push(...extras)
  }

  return (
    // Por debajo del velo del menú lateral (`z-40`): con la misma capa, y al ir
    // después en el árbol, la barra quedaría iluminada sobre el fondo oscuro.
    <nav
      data-tour="nav-movil"
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
