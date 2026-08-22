import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import { Building2, LayoutDashboard, LogOut, Menu, ShieldCheck, Sparkles, Tags, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { PanelLateral } from './PanelLateral'
import { useEsEscritorio } from '../../hooks/useMediaQuery'
import { PWAInstallPrompt } from '../ui/PWAInstallPrompt'

/**
 * Área del dueño de la plataforma. Deliberadamente **no** comparte el menú
 * clínico: este usuario no pertenece a ninguna clínica y no entra a los datos
 * de sus pacientes; administra cuentas, planes y cobros.
 */
const links = [
  { to: '/plataforma', label: 'Resumen', icon: LayoutDashboard, end: true },
  { to: '/plataforma/asistente', label: 'Asistente', icon: Sparkles, end: false },
  { to: '/plataforma/clinicas', label: 'Clínicas', icon: Building2, end: false },
  { to: '/plataforma/planes', label: 'Planes', icon: Tags, end: false },
]

export function PlataformaLayout() {
  const { usuario, logout } = useAuth()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const cerrarMenu = useCallback(() => setMenuAbierto(false), [])
  const { pathname } = useLocation()
  const esEscritorio = useEsEscritorio()

  useEffect(() => setMenuAbierto(false), [pathname])
  useEffect(() => {
    if (esEscritorio) setMenuAbierto(false)
  }, [esEscritorio])

  return (
    <div className="flex h-dvh bg-slate-50">
      <PanelLateral abierto={menuAbierto} onCerrar={cerrarMenu} className="border-r border-slate-800 bg-slate-900">
        <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-teal-500 to-teal-300 text-slate-900 shadow-md">
            <ShieldCheck size={20} />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="font-display text-xl font-bold tracking-tight text-white">Vetora</span>
            <span className="-mt-1 text-[10px] font-bold uppercase tracking-wider text-teal-400">Plataforma</span>
          </div>
          <button
            onClick={cerrarMenu}
            aria-label="Cerrar menú"
            className="ml-auto -mr-1 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-800 hover:text-white md:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto px-4 py-5 sm:py-6">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={cerrarMenu}
              className={({ isActive }) =>
                clsx(
                  'flex cursor-pointer items-center gap-3.5 rounded-xl px-4 py-3 text-sm transition-colors duration-200',
                  isActive
                    ? 'bg-slate-800 font-bold text-white'
                    : 'font-medium text-slate-400 hover:bg-slate-800/60 hover:text-white',
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Sesión</p>
          <p className="mt-1 truncate px-2 text-sm font-bold text-white">{usuario?.nombre}</p>
          <button
            onClick={logout}
            className="mt-3 flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2.5 text-xs font-semibold text-slate-400 transition-colors hover:bg-slate-800 hover:text-rose-400"
          >
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </PanelLateral>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200/60 bg-white px-3 py-3 shadow-sm sm:px-6 sm:py-4">
          <button
            onClick={() => setMenuAbierto(true)}
            aria-label="Abrir menú"
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 md:hidden"
          >
            <Menu size={20} />
          </button>

          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-slate-900">Panel de plataforma</p>
            <p className="truncate text-xs font-medium text-slate-400">
              <span className="hidden sm:inline">Clínicas contratadas, planes y cobros · </span>sin acceso a datos
              clínicos
            </p>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-bold leading-tight text-slate-800">{usuario?.nombre}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-teal-600">Super administrador</p>
            </div>
            <div className="flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-xl border border-slate-900/10 bg-slate-900 font-display text-xs font-bold text-white">
              {usuario?.nombre.substring(0, 2).toUpperCase()}
            </div>
            <button
              onClick={logout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent text-slate-400 transition-colors hover:border-rose-100 hover:bg-rose-50 hover:text-rose-600 sm:hidden"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
          <Outlet />
        </main>
      </div>
      <PWAInstallPrompt />
    </div>
  )
}
