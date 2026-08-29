import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Home, LayoutGrid, Tag, Info, MessageCircle, Menu, X, LogIn, LayoutDashboard, ChevronRight } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { useBloqueoScroll } from '../../hooks/useBloqueoScroll'
import { rutaDeInicio } from '../../lib/personal'
import { FuncionalidadesModal } from './FuncionalidadesModal'
import { PlanesModal } from './PlanesModal'
import { AcercaDeModal } from './AcercaDeModal'
import { ContactoModal } from './ContactoModal'
import { clsx } from 'clsx'

type ModalMenu = 'funcionalidades' | 'planes' | 'acerca' | 'contacto'

type NavItem =
  | { kind: 'link'; to: string; label: string; icon: typeof Home; activeOnlyExact?: boolean }
  | { kind: 'modal'; modal: ModalMenu; label: string; icon: typeof Home }

const NAV_ITEMS: NavItem[] = [
  { kind: 'link', to: '/', label: 'Inicio', icon: Home, activeOnlyExact: true },
  { kind: 'modal', modal: 'funcionalidades', label: 'Funcionalidades', icon: LayoutGrid },
  { kind: 'modal', modal: 'planes', label: 'Planes', icon: Tag },
  { kind: 'modal', modal: 'acerca', label: 'Acerca de Nosotros', icon: Info },
  { kind: 'modal', modal: 'contacto', label: 'Contáctanos', icon: MessageCircle },
]

export function HomeHeader() {
  const { usuario } = useAuth()
  const location = useLocation()
  const [drawerAbierto, setDrawerAbierto] = useState(false)
  const [modalAbierto, setModalAbierto] = useState<ModalMenu | null>(null)
  // Cada modal (Funcionalidades/Planes/Acerca/Contacto) ya bloquea el scroll
  // por su cuenta mientras vive montado — igual que `HeroSection` con su
  // propio `PlanesModal`. Bloquearlo también aquí duplicaba el hook: al
  // cerrar, la limpieza del modal hijo pisaba la del header y el scroll
  // quedaba trabado para siempre.
  useBloqueoScroll(drawerAbierto)

  // Misma fuente que `InicioSegunRol`, `LoginPage` y el canje del enlace de
  // acceso: cuatro copias de esto es como una acabó mandando a la landing.
  const rutaDestino = rutaDeInicio(usuario)

  return (
    <header className="relative z-30 pt-3 pb-3 sm:pt-4 sm:pb-4">
      <div className="flex items-center justify-between gap-4">
        {/* Logo Vetora a la izquierda (ocupa ~35-40% en mobile) */}
        <Link
          to="/"
          className="flex items-center group transition-transform duration-200 active:scale-95 shrink-0"
        >
          <img
            src="/vetoralogo.png"
            alt="Vetora - Plataforma de Gestión Veterinaria Digital"
            className="h-10 sm:h-12 md:h-14 w-auto drop-shadow-xs"
          />
        </Link>

        {/* Navegación central SOLO visible en Desktop (>= md) */}
        <nav className="hidden md:flex items-center gap-6 lg:gap-10" aria-label="Navegación principal">
          {NAV_ITEMS.map((item) => {
            const { label, icon: Icon } = item
            const isActive =
              item.kind === 'link' &&
              (item.activeOnlyExact ? location.pathname === item.to : location.pathname.startsWith(item.to))

            const claseBase = clsx(
              'flex flex-col items-center gap-1 group py-1 transition-all duration-200 cursor-pointer',
              isActive
                ? 'text-slate-900 font-bold'
                : 'text-slate-600 hover:text-slate-900 font-medium'
            )
            const contenido = (
              <>
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
              </>
            )

            return item.kind === 'link' ? (
              <Link key={item.to} to={item.to} className={claseBase}>
                {contenido}
              </Link>
            ) : (
              <button
                key={item.modal}
                type="button"
                onClick={() => setModalAbierto(item.modal)}
                className={claseBase}
              >
                {contenido}
              </button>
            )
          })}
        </nav>

        {/* Acciones a la derecha: Botón de sesión en Desktop, Hamburguesa en Mobile */}
        <div className="flex items-center gap-3">
          {/* Botón Desktop */}
          <div className="hidden md:block">
            {usuario ? (
              <Link
                to={rutaDestino}
                className="clay-btn inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold tracking-wide"
              >
                <LayoutDashboard size={16} />
                <span>{usuario.rol === 'cliente' ? 'Mi Portal' : 'Ir al Sistema'}</span>
              </Link>
            ) : (
              <Link
                to="/login"
                className="clay-btn inline-flex items-center gap-2 px-7 py-2.5 text-sm font-semibold tracking-wide"
              >
                <LogIn size={16} />
                <span>Iniciar Sesión</span>
              </Link>
            )}
          </div>

          {/* Botón de Menú Hamburguesa Grande en Mobile (3 líneas horizontales) */}
          <button
            type="button"
            className="md:hidden p-2.5 -mr-1 text-slate-700 hover:text-slate-900 active:scale-95 transition-transform flex items-center justify-center"
            onClick={() => setDrawerAbierto(true)}
            aria-label="Abrir menú de navegación"
          >
            <Menu size={32} strokeWidth={2.4} className="text-slate-800" />
          </button>
        </div>
      </div>

      {/* Drawer Móvil Lateral / Overlay */}
      {drawerAbierto && (
        <div className="fixed inset-0 z-50 md:hidden flex justify-end">
          {/* Backdrop desenfocado */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-fade-in"
            onClick={() => setDrawerAbierto(false)}
            aria-hidden="true"
          />

          {/* Panel Lateral Drawer */}
          <div className="relative w-full max-w-xs bg-white/95 backdrop-blur-xl h-full p-6 flex flex-col justify-between shadow-2xl border-l border-slate-100 animate-slide-in-right z-10">
            <div>
              <div className="flex items-center justify-between pb-6 border-b border-slate-100">
                <img
                  src="/vetoralogo.png"
                  alt="Vetora"
                  className="h-9 w-auto"
                />
                <button
                  type="button"
                  onClick={() => setDrawerAbierto(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  aria-label="Cerrar menú"
                >
                  <X size={24} />
                </button>
              </div>

              <nav className="mt-6 space-y-1.5" aria-label="Menú móvil">
                {NAV_ITEMS.map((item) => {
                  const { label, icon: Icon } = item
                  const isActive =
                    item.kind === 'link' &&
                    (item.activeOnlyExact ? location.pathname === item.to : location.pathname.startsWith(item.to))

                  const claseBase = clsx(
                    'flex items-center justify-between p-3.5 rounded-2xl transition-all font-medium text-sm w-full text-left',
                    isActive
                      ? 'bg-slate-900 text-white shadow-md'
                      : 'text-slate-700 hover:bg-slate-100'
                  )
                  const contenido = (
                    <>
                      <div className="flex items-center gap-3">
                        <Icon size={20} className={isActive ? 'text-white' : 'text-slate-500'} />
                        <span className="font-semibold">{label}</span>
                      </div>
                      <ChevronRight size={18} className={isActive ? 'text-white/60' : 'text-slate-400'} />
                    </>
                  )

                  return item.kind === 'link' ? (
                    <Link key={item.to} to={item.to} onClick={() => setDrawerAbierto(false)} className={claseBase}>
                      {contenido}
                    </Link>
                  ) : (
                    <button
                      key={item.modal}
                      type="button"
                      onClick={() => {
                        setDrawerAbierto(false)
                        setModalAbierto(item.modal)
                      }}
                      className={claseBase}
                    >
                      {contenido}
                    </button>
                  )
                })}
              </nav>
            </div>

            <div className="pt-6 border-t border-slate-100">
              {usuario ? (
                <Link
                  to={rutaDestino}
                  onClick={() => setDrawerAbierto(false)}
                  className="clay-btn w-full py-3.5 flex items-center justify-center gap-2 text-sm font-bold text-center"
                >
                  <LayoutDashboard size={18} />
                  <span>{usuario.rol === 'cliente' ? 'Mi Portal' : 'Ir al Sistema'}</span>
                </Link>
              ) : (
                <Link
                  to="/login"
                  onClick={() => setDrawerAbierto(false)}
                  className="clay-btn w-full py-3.5 flex items-center justify-center gap-2 text-sm font-bold text-center"
                >
                  <LogIn size={18} />
                  <span>Iniciar Sesión</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {modalAbierto === 'funcionalidades' && (
        <FuncionalidadesModal onClose={() => setModalAbierto(null)} onVerPlanes={() => setModalAbierto('planes')} />
      )}
      {modalAbierto === 'planes' && <PlanesModal onClose={() => setModalAbierto(null)} />}
      {modalAbierto === 'acerca' && (
        <AcercaDeModal onClose={() => setModalAbierto(null)} onVerPlanes={() => setModalAbierto('planes')} />
      )}
      {modalAbierto === 'contacto' && <ContactoModal onClose={() => setModalAbierto(null)} />}
    </header>
  )
}
