import { Link, useLocation } from 'react-router-dom'
import { Home, PawPrint, CalendarCheck, Store, User } from 'lucide-react'
import { clsx } from 'clsx'

interface MobileNavItem {
  to: string
  label: string
  icon: typeof Home
  activeOnlyExact?: boolean
}

const MOBILE_NAV_ITEMS: MobileNavItem[] = [
  { to: '/', label: 'Inicio', icon: Home, activeOnlyExact: true },
  { to: '/portal-cliente/mascotas', label: 'Mascotas', icon: PawPrint },
  { to: '/portal-cliente/citas', label: 'Citas', icon: CalendarCheck },
  { to: '/portal-cliente/tienda', label: 'Tienda', icon: Store },
  { to: '/portal-cliente/perfil', label: 'Perfil', icon: User },
]

export function HomeMobileNav() {
  const location = useLocation()

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#f4faf8]/95 backdrop-blur-xl border-t border-slate-200/80 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      aria-label="Navegación inferior móvil"
    >
      <div className="grid grid-cols-5 h-16 max-w-lg mx-auto items-center px-2">
        {MOBILE_NAV_ITEMS.map(({ to, label, icon: Icon, activeOnlyExact }) => {
          const isActive = activeOnlyExact
            ? location.pathname === to
            : location.pathname.startsWith(to)

          return (
            <Link
              key={to}
              to={to}
              className={clsx(
                'flex flex-col items-center justify-center gap-1 py-1 px-1 transition-all duration-150 active:scale-90',
                isActive
                  ? 'text-[#0d9488] font-bold'
                  : 'text-slate-700 hover:text-slate-900 font-medium'
              )}
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 2.3 : 1.8}
                className={clsx(
                  'transition-transform duration-150',
                  isActive ? 'text-[#0d9488]' : 'text-slate-700'
                )}
              />
              <span className="text-[11px] leading-tight tracking-tight">
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
