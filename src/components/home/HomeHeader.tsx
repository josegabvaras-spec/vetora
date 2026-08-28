import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Home, PawPrint, CalendarCheck, Store, User, Menu, X, LogIn, LayoutDashboard } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { clsx } from 'clsx'

interface NavItem {
  to: string
  label: string
  icon: typeof Home
  activeOnlyExact?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Inicio', icon: Home, activeOnlyExact: true },
  { to: '/portal-cliente/mascotas', label: 'Mascotas', icon: PawPrint },
  { to: '/portal-cliente/citas', label: 'Citas', icon: CalendarCheck },
  { to: '/portal-cliente/tienda', label: 'Tienda', icon: Store },
  { to: '/portal-cliente/perfil', label: 'Perfil', icon: User },
]

export function HomeHeader() {
  const { usuario, esPlataforma } = useAuth()
  const location = useLocation()
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false)

  // Determinar la ruta de panel según el rol para usuarios autenticados
  const rutaDestino = esPlataforma
    ? '/plataforma'
    : usuario?.rol === 'cliente'
    ? '/portal-cliente/dashboard'
    : '/agenda'

  return (
    <header className="relative z-30 pt-3 pb-4">
      <div className="flex items-center justify-between gap-4">
        {/* Logo Vetora a la izquierda */}
        <Link
          to="/"
          className="flex items-center group transition-transform duration-300 hover:scale-[1.02] shrink-0"
        >
          <img
            src="/vetoralogo.png"
            alt="Vetora - Plataforma de Gestión Veterinaria Digital"
            className="h-12 sm:h-14 md:h-16 w-auto drop-shadow-sm"
          />
        </Link>

        {/* Navegación central para Desktop / Tablet */}
        <nav className="hidden md:flex items-center gap-6 lg:gap-10" aria-label="Navegación principal">
          {NAV_ITEMS.map(({ to, label, icon: Icon, activeOnlyExact }) => {
            const isActive = activeOnlyExact
              ? location.pathname === to
              : location.pathname.startsWith(to)

            return (
              <Link
                key={to}
                to={to}
                className={clsx(
                  'flex flex-col items-center gap-1 group py-1 transition-all duration-200',
                  isActive
                    ? 'text-slate-900 font-bold'
                    : 'text-slate-600 hover:text-slate-900 font-medium'
                )}
              >
                <Icon
                  size={24}
                  strokeWidth={isActive ? 2.2 : 1.8}
                  className={clsx(
                    'transition-transform duration-200 group-hover:scale-110',
                    isActive ? 'text-slate-900' : 'text-slate-600 group-hover:text-slate-900'
                  )}
                />
                <span className="text-xs lg:text-sm tracking-tight">{label}</span>
                {isActive && (
                  <span className="h-1 w-5 rounded-full bg-slate-800 -mb-1 mt-0.5" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Botón de Iniciar Sesión / Ir al Panel a la derecha */}
        <div className="flex items-center gap-3">
          {usuario ? (
            <Link
              to={rutaDestino}
              className="clay-btn inline-flex items-center gap-2 px-5 py-2.5 sm:px-6 sm:py-3 text-xs sm:text-sm font-semibold tracking-wide"
            >
              <LayoutDashboard size={16} />
              <span>{usuario.rol === 'cliente' ? 'Mi Portal' : 'Ir al Sistema'}</span>
            </Link>
          ) : (
            <Link
              to="/login"
              className="clay-btn inline-flex items-center gap-2 px-6 py-2.5 sm:px-7 sm:py-3 text-xs sm:text-sm font-semibold tracking-wide"
            >
              <LogIn size={16} className="hidden sm:inline" />
              <span>Iniciar Sesión</span>
            </Link>
          )}

          {/* Botón de menú hamburguesa móvil */}
          <button
            type="button"
            className="md:hidden p-2 rounded-xl text-slate-700 bg-white/70 backdrop-blur-md border border-white/80 shadow-sm"
            onClick={() => setMenuMovilAbierto(!menuMovilAbierto)}
            aria-label="Abrir menú"
          >
            {menuMovilAbierto ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Menú desplegable para móviles */}
      {menuMovilAbierto && (
        <div className="md:hidden mt-3 p-4 bg-white/90 backdrop-blur-xl rounded-2xl border border-white/80 shadow-lg animate-scale-in">
          <nav className="grid grid-cols-5 gap-2 text-center">
            {NAV_ITEMS.map(({ to, label, icon: Icon, activeOnlyExact }) => {
              const isActive = activeOnlyExact
                ? location.pathname === to
                : location.pathname.startsWith(to)

              return (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMenuMovilAbierto(false)}
                  className={clsx(
                    'flex flex-col items-center gap-1 p-2 rounded-xl transition-all',
                    isActive ? 'bg-slate-100/80 text-slate-900 font-bold' : 'text-slate-600 hover:bg-slate-50'
                  )}
                >
                  <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                  <span className="text-[10px] sm:text-xs">{label}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      )}
    </header>
  )
}
