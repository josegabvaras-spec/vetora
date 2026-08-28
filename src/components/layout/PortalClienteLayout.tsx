import { Outlet, Navigate, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { clsx } from 'clsx'
import { Home, PawPrint, CalendarCheck, Store, User } from 'lucide-react'
import { OnboardingProvider } from '../../features/onboarding/OnboardingProvider'
import { PASOS_PORTAL } from '../../lib/onboarding'

const TABS = [
  { to: '/portal-cliente/dashboard', label: 'Inicio', icon: Home },
  { to: '/portal-cliente/mascotas', label: 'Mascotas', icon: PawPrint },
  { to: '/portal-cliente/citas', label: 'Citas', icon: CalendarCheck },
  { to: '/portal-cliente/tienda', label: 'Tienda', icon: Store },
  { to: '/portal-cliente/perfil', label: 'Perfil', icon: User },
] as const

export function PortalClienteLayout() {
  const { usuario } = useAuth()
  const location = useLocation()

  // Solo clientes permitidos
  if (usuario?.rol !== 'cliente') {
    return <Navigate to="/" replace />
  }

  /** El dashboard y las sub-rutas de tienda no muestran el header grande. */
  const esDashboard = location.pathname === '/portal-cliente/dashboard'

  return (
    <OnboardingProvider pasos={PASOS_PORTAL}>
    <div className="min-h-screen bg-gradient-to-b from-green-50/60 via-white to-emerald-50/30">
      {/* ── Header con logo de Vetora ── */}
      {esDashboard && (
        <header className="portal-header-bg relative overflow-hidden pt-[env(safe-area-inset-top)]">
          {/* Huellas de pata decorativas */}
          <div className="paw-print absolute top-3 left-4 -rotate-12">
            <PawPrint size={28} strokeWidth={2.5} />
          </div>
          <div className="paw-print absolute top-6 right-6 rotate-12">
            <PawPrint size={24} strokeWidth={2.5} />
          </div>
          <div className="paw-print absolute bottom-2 left-1/4 rotate-[25deg]">
            <PawPrint size={20} strokeWidth={2.5} />
          </div>
          <div className="paw-print absolute top-2 right-1/4 -rotate-[20deg]">
            <PawPrint size={18} strokeWidth={2.5} />
          </div>

          <div className="flex flex-col items-center justify-center py-5 px-4 relative z-10">
            <img
              src="/vetoralogo.png"
              alt="Vetora - Plataforma de Gestión Veterinaria Digital"
              className="h-24 sm:h-28 w-auto drop-shadow-sm hover:scale-105 transition-transform duration-300"
            />
          </div>
        </header>
      )}

      {/* ── Contenido principal ── */}
      <main className="pb-24 min-h-[60dvh]">
        <div className={clsx(
          'mx-auto px-4 sm:px-6',
          esDashboard ? 'max-w-lg pt-4' : 'max-w-5xl py-6'
        )}>
          <Outlet />
        </div>
      </main>

      {/* ── Barra de navegación inferior ── */}
      <nav className="portal-bottom-nav" aria-label="Navegación del portal">
        <div className="flex h-16 items-center justify-around px-2 max-w-lg mx-auto">
          {TABS.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to
              || (to === '/portal-cliente/tienda' && location.pathname.startsWith('/portal-cliente/tienda'))
              || (to === '/portal-cliente/mascotas' && location.pathname.startsWith('/portal-cliente/paciente'))

            return (
              <NavLink
                key={to}
                to={to}
                className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1"
              >
                <div
                  className={clsx(
                    'flex h-8 w-12 items-center justify-center rounded-full transition-all duration-300',
                    isActive
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-transparent text-slate-400'
                  )}
                >
                  <Icon
                    size={22}
                    strokeWidth={isActive ? 2.5 : 1.8}
                    className={clsx(isActive && 'scale-110 transition-transform')}
                  />
                </div>
                <span
                  className={clsx(
                    'text-[10px] font-semibold tracking-wide',
                    isActive ? 'text-emerald-700' : 'text-slate-500'
                  )}
                >
                  {label}
                </span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
    </OnboardingProvider>
  )
}
